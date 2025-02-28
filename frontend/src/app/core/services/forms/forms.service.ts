import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from "@angular/common/http";
import { FormGroup } from "@angular/forms";
import { catchError, map } from "rxjs/operators";
import { Observable } from "rxjs";

@Injectable({
  providedIn: 'root'
})
export class FormsService {

  constructor(
    private _httpClient:HttpClient,
  ) { }

  submit$(form:FormGroup, resourceEndpoint:string, resourceId?:string, formHttpMethod?: 'post' | 'patch'):Observable<any> {
    const modelToSubmit = this.formatModelToSubmit(form.getRawValue());
    const httpMethod = resourceId ? 'patch' : (formHttpMethod || 'post');
    const url = resourceId ? `${resourceEndpoint}/${resourceId}` : resourceEndpoint;

    return this._httpClient
        [httpMethod](
        url,
        modelToSubmit,
        {
          withCredentials: true,
          responseType: 'json'
        }
      )
      .pipe(
        catchError((error:HttpErrorResponse) => {
          if (error.status == 422 ) {
            this.handleBackendFormValidationErrors(error, form);
          }

          throw error;
        })
      );
  }

  validateForm$(form:FormGroup, resourceEndpoint:string):Observable<any> {
    const modelToSubmit = this.formatModelToSubmit(form.value);

    return this._httpClient
      .post(
        `${resourceEndpoint}/form`,
        modelToSubmit,
      {
          withCredentials: true,
          responseType: 'json'
        }
      )
      .pipe(
        map((response: HalSource) => this.getFormattedErrors(Object.values(response?._embedded?.validationErrors))),
        map((formattedErrors: IFormattedValidationError[]) => this.setFormValidationErrors(formattedErrors, form)),
      );
  }

  getFormBackendValidationError$(formValue: {[key:string]: any}, resourceEndpoint:string, limitValidationToKeys?:string | string[]) {
    const modelToSubmit = this.formatModelToSubmit(formValue);

    return this._httpClient
      .post(
        resourceEndpoint,
        modelToSubmit,
        {
          withCredentials: true,
          responseType: 'json',
          headers: {
            'content-type': 'application/json; charset=utf-8'
          }
        }
      )
      .pipe(
        map((response: HalSource) => this.getAllFormValidationErrors(response._embedded.validationErrors, limitValidationToKeys))
      );
  }

  private formatModelToSubmit(formModel:IOPFormModel):IOPFormModel {
    const resources = formModel?._links || {};

    const formattedResources = Object
      .keys(resources)
      .reduce((result, resourceKey) => {
        const resource = resources[resourceKey];
        // Form.payload resources have a HalLinkSource interface while
        // API resource options have a IAllowedValue interface
        const resourceValue = Array.isArray(resource) ?
          resource.map(resourceElement => ({ href: resourceElement?.href || resourceElement?._links?.self?.href || null })) :
          { href: resource?.href || resource?._links?.self?.href || null };

        return {
          ...result,
          [resourceKey]: resourceValue,
        };
      }, {});

    return {
      ...formModel,
      _links: formattedResources,
    }
  }

  private handleBackendFormValidationErrors(error:HttpErrorResponse, form:FormGroup):void {
    const errors:IOPFormError[] = error?.error?._embedded?.errors ?
      error?.error?._embedded?.errors : [error.error];
    const formErrors = this.getFormattedErrors(errors);

    this.setFormValidationErrors(formErrors, form);
  }

  private setFormValidationErrors(errors:IFormattedValidationError[], form:FormGroup) {
    errors.forEach((err:any) => {
      const formControl = form.get(err.key) || form.get('_links')?.get(err.key);

      formControl?.setErrors({[err.key]: {message: err.message}});
    });
  }

  private getAllFormValidationErrors(validationErrors:IOPValidationErrors, formControlKeys?:string | string[]): {[key:string]: {message:string}} {
    const errors = Object.values(validationErrors);
    const keysToValidate = Array.isArray(formControlKeys) ? formControlKeys : [formControlKeys];
    const formErrors = this.getFormattedErrors(errors)
      .filter(error => {
        if (!formControlKeys) {
          return true;
        } else {
          return keysToValidate.includes(error.key);
        }
      })
      .reduce((result, { key, message }) => {
        return {
          ...result,
          [key]: {message}
        }
      }, {})

    return formErrors
  }

  private getFormattedErrors(errors:IOPFormError[]):IFormattedValidationError[] {
    const formattedErrors = errors.map(err => ({
      key: err._embedded.details.attribute,
      message:  err.message
    }));

    return formattedErrors;
  }
}
