//-- copyright
// OpenProject is an open source project management software.
// Copyright (C) 2012-2021 the OpenProject GmbH
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License version 3.
//
// OpenProject is a fork of ChiliProject, which is a fork of Redmine. The copyright follows:
// Copyright (C) 2006-2013 Jean-Philippe Lang
// Copyright (C) 2010-2013 the ChiliProject Team
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License
// as published by the Free Software Foundation; either version 2
// of the License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program; if not, write to the Free Software
// Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
//
// See docs/COPYRIGHT.rdoc for more details.
//++

import { Component, InjectFlags, OnInit } from '@angular/core';
import { HalResourceSortingService } from 'core-app/modules/hal/services/hal-resource-sorting.service';
import { CollectionResource } from 'core-app/modules/hal/resources/collection-resource';
import { HalResource } from 'core-app/modules/hal/resources/hal-resource';
import { EditFieldComponent } from '../../edit-field.component';
import { SelectAutocompleterRegisterService } from 'core-app/modules/fields/edit/field-types/select-edit-field/select-autocompleter-register.service';
import { from } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { HalResourceNotificationService } from 'core-app/modules/hal/services/hal-resource-notification.service';
import { InjectField } from 'core-app/helpers/angular/inject-field.decorator';
import { CreateAutocompleterComponent } from "core-app/modules/autocompleter/create-autocompleter/create-autocompleter.component";
import { EditFormComponent } from "core-app/modules/fields/edit/edit-form/edit-form.component";
import { StateService } from "@uirouter/core";

export interface ValueOption {
  name:string;
  href:string|null;
}

@Component({
  templateUrl: './select-edit-field.component.html',
})
export class SelectEditFieldComponent extends EditFieldComponent implements OnInit {
  @InjectField() selectAutocompleterRegister:SelectAutocompleterRegisterService;
  @InjectField() halNotification:HalResourceNotificationService;
  @InjectField() halSorting:HalResourceSortingService;
  @InjectField() $state:StateService;
  @InjectField(EditFormComponent, null, InjectFlags.Optional) editFormComponent:EditFormComponent;

  public availableOptions:any[];
  public valueOptions:ValueOption[];
  public text:{ [key:string]:string };
  public appendTo:any = null;
  public referenceOutputs:{ [key:string]:Function } = {
    onCreate: (newElement:HalResource) => this.onCreate(newElement),
    onChange: (value:HalResource) => this.onChange(value),
    onKeydown: (event:JQuery.TriggeredEvent) => this.handler.handleUserKeydown(event, true),
    onOpen: () => this.onOpen(),
    onClose: () => this.onClose(),
    onAfterViewInit: (component:CreateAutocompleterComponent) => this._autocompleterComponent = component
  };
  public get selectedOption() {
    const href = this.value ? this.value.href : null;
    return _.find(this.valueOptions, o => o.href === href)!;
  }
  public set selectedOption(val:ValueOption|HalResource) {
    // The InviteUserModal gives us a resource that is not in availableOptions yet,
    // but we also don't want to wait for a refresh of the options every time we want to
    // select an option, so if we get a HalResource we trust it exists
    if (val instanceof HalResource) {
      this.value = val;
      return;
    }

    const option = _.find(this.availableOptions, o => o.href === val.href);

    // Special case 'null' value, which angular
    // only understands in ng-options as an empty string.
    if (option && option.href === '') {
      option.href = null;
    }

    this.value = option;
  }
  public showAddNewButton:boolean;

  protected valuesLoaded = false;
  protected _autocompleterComponent:CreateAutocompleterComponent;

  private hiddenOverflowContainer = '.__hidden_overflow_container';
  /** Remember the values loading promise which changes as soon as the changeset is updated
   * (e.g., project or type is changed).
   */
  private valuesLoadingPromise:Promise<unknown>;

  public ngOnInit() {
    super.ngOnInit();
    this.appendTo = this.overflowingSelector;

    this.handler
      .$onUserActivate
      .pipe(
        this.untilDestroyed()
      )
      .subscribe(() => {
        this.valuesLoadingPromise.then(() => {
          this._autocompleterComponent.openDirectly = true;
        });
      });

    this._syncUrlParamsOnChangeIfNeeded(this.handler.fieldName, this.editFormComponent?.editMode);

  }

  protected initialize() {
    this.text = {
      requiredPlaceholder: this.I18n.t('js.placeholders.selection'),
      placeholder: this.I18n.t('js.placeholders.default')
    };

    this.valuesLoadingPromise = this.change.getForm().then(() => {
      return this.initialValueLoading();
    });

    this.initializeShowAddButton();
  }

  initializeShowAddButton() {
    this.showAddNewButton = this.schema.type === 'User';
  }

  protected initialValueLoading() {
    this.valuesLoaded = false;
    return this.loadValues().toPromise();
  }

  public autocompleterComponent() {
    const type = this.schema.type;
    return this.selectAutocompleterRegister.getAutocompleterOfAttribute(type) || CreateAutocompleterComponent;
  }

  private setValues(availableValues:HalResource[]) {
    this.availableOptions = this.sortValues(availableValues);
    this.addEmptyOption();
    this.valueOptions = this.availableOptions.map(el => this.mapAllowedValue(el));
  }

  protected loadValues(query?:string) {
    const allowedValues = this.schema.allowedValues;

    if (Array.isArray(allowedValues)) {
      this.setValues(allowedValues);
      this.valuesLoaded = true;
    } else if (allowedValues && !this.valuesLoaded) {
      return this.loadValuesFromBackend(query);
    } else {
      this.setValues([]);
    }

    return from(Promise.resolve(this.valueOptions));
  }

  protected loadValuesFromBackend(query?:string) {
    return from(
      this.loadAllowedValues(query)
    ).pipe(
      tap(collection => {
        // if it is an unpaginated collection or if we get all possible entries when fetching with a blank
        // query, we do not need to load the values again;
        if (collection.count === undefined || collection.total === undefined || (!query && collection.total === collection.count)) {
          this.valuesLoaded = true;
        }
      }),
      map(collection => {
        if (collection.count === undefined || collection.total === undefined || (!query && collection.total === collection.count) || !this.value) {
          return collection.elements;
        } else {
          return collection.elements.concat([this.value]);
        }
      }),
      tap(elements => this.setValues(elements)),
      map(() => this.valueOptions)
    );
  }

  protected loadAllowedValues(query?:string):Promise<CollectionResource> {
    // Cache the search without any params
    if (!query) {
      const cacheKey = this.schema.allowedValues.$link.href;
      return this.change.cacheValue(cacheKey, this.fetchAllowedValueQuery.bind(this));
    }

    return this.fetchAllowedValueQuery(query);
  }

  protected fetchAllowedValueQuery(query?:string) {
    return this.schema.allowedValues.$link.$fetch(this.allowedValuesFilter(query)) as Promise<CollectionResource>;
  }

  private addValue(val:HalResource) {
    this.availableOptions.push(val);
    this.valueOptions.push({ name: val.name, href: val.href });
  }

  public get currentValueInvalid():boolean {
    return !!(
      (this.value && !_.some(this.availableOptions, (option:HalResource) => (option.href === this.value.href)))
      ||
      (!this.value && this.schema.required)
    );
  }

  public onCreate(newElement:HalResource) {
    this.addValue(newElement);
    this.selectedOption = { name: newElement.name, href: newElement.href };
    this.handler.handleUserSubmit();
  }

  public onOpen() {
    jQuery(this.hiddenOverflowContainer).one('scroll', () => {
      this._autocompleterComponent.closeSelect();
    });
  }

  public onClose() {
    // Nothing to do
  }

  public onChange(value:HalResource|undefined|null) {
    if (value) {
      this.selectedOption = value;
      this.handler.handleUserSubmit();
      return;
    }

    const emptyOption = this.getEmptyOption();

    if (emptyOption) {
      this.selectedOption = emptyOption;
      this.handler.handleUserSubmit();
    }
  }

  private addEmptyOption() {
    // Empty options are not available for required fields
    if (this.isRequired()) {
      return;
    }

    // Since we use the original schema values, avoid adding
    // the option if one is returned / exists already.
    const emptyOption = this.getEmptyOption();
    if (emptyOption === undefined) {
      this.availableOptions.unshift({
        name: this.text.placeholder,
        href: ''
      });
    }
  }

  protected isRequired() {
    return this.schema.required;
  }

  protected sortValues(availableValues:HalResource[]) {
    return this.halSorting.sort(availableValues);
  }

  protected mapAllowedValue(value:HalResource):ValueOption {
    return { name: value.name, href: value.href };
  }

  // Subclasses shall be able to override the filters with which the
  // allowed values are reduced in the backend.
  protected allowedValuesFilter(query?:string) {
    return {};
  }

  private getEmptyOption():ValueOption|undefined {
    return _.find(this.availableOptions, el => el.name === this.text.placeholder);
  }

  private _syncUrlParamsOnChangeIfNeeded(fieldName:string, editMode:boolean) {
    // Work package type changes need to be synced with the type url param
    // in order to keep the form changes (changeset) between route/state changes
    if (fieldName === 'type' && editMode) {
      this.handler.registerOnBeforeSubmit(() => {
        const newType = this.value?.$source?.id;

        if (newType) {
          this.$state.go('.', { type: newType }, { notify: false });
        }
      });
    }
  }
}
