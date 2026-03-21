type Validator = (value: any, fieldValues?: any) => string | false

function isNilOrEmpty(value: any): boolean {
  return value === undefined || value === null || value === ''
}

export const is = {
  required: (): Validator => value => isNilOrEmpty(value) && 'This field is required',
  minLength:
    (min: number): Validator =>
    value =>
      !!value && value.length < min && `Must be at least ${min} characters`,
  maxLength:
    (max: number): Validator =>
    value =>
      !!value && value.length > max && `Must be at most ${max} characters`,
  url: (): Validator => value =>
    !!value &&
    !/^(?:https?:\/\/)?[\w.-]+(?:\.[\w.-]+)+[\w\-._~:/?#[\]@!$&'()*+,;=.]+$/.test(value) &&
    'Must be a valid URL',
}

export function generateErrors(
  fieldValues: Record<string, any>,
  fieldValidators: Record<string, Validator | Validator[]>,
): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const [name, validators] of Object.entries(fieldValidators)) {
    const list = Array.isArray(validators) ? validators : [validators]
    for (const validator of list) {
      const msg = validator(fieldValues[name], fieldValues)
      if (msg && !errors[name]) {
        errors[name] = msg
      }
    }
  }
  return errors
}
