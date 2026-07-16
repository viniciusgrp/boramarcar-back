import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { isValidBrazilianPhone } from '../utils/brazilian-phone.util';

@ValidatorConstraint({ name: 'isBrazilianPhone', async: false })
export class IsBrazilianPhoneConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    if (value === undefined || value === null) {
      return true;
    }

    if (typeof value !== 'string') {
      return false;
    }

    const required = Boolean(
      (args.constraints[0] as { required?: boolean } | undefined)?.required,
    );

    return isValidBrazilianPhone(value, { required });
  }

  defaultMessage(): string {
    return 'Informe um telefone brasileiro válido com DDD (ex.: 11999998888).';
  }
}

export function IsBrazilianPhone(
  options?: { required?: boolean },
  validationOptions?: ValidationOptions,
) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [options ?? {}],
      validator: IsBrazilianPhoneConstraint,
    });
  };
}
