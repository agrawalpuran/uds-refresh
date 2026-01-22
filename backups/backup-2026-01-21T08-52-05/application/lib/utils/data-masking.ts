/**
 * Data Masking Utility for Vendor Access
 * 
 * Vendors should only see masked versions of employee PII data:
 * - Name → "J***** D**"
 * - Email → "j*******@domain.com"
 * - Phone → mask all but last 2–3 digits ("*******123")
 * - Address → mask mid content ("123 M**** Street")
 */

/**
 * Masks a name (first and last name)
 * @param firstName - First name
 * @param lastName - Last name
 * @returns Masked name like "J***** D**"
 */
export function maskName(firstName?: string, lastName?: string): string {
  if (!firstName && !lastName) {
    return '******'
  }
  
  const maskFirst = firstName 
    ? firstName.charAt(0).toUpperCase() + '*'.repeat(Math.max(1, firstName.length - 1))
    : ''
  const maskLast = lastName
    ? lastName.charAt(0).toUpperCase() + '*'.repeat(Math.max(1, lastName.length - 1))
    : ''
  
  if (maskFirst && maskLast) {
    return `${maskFirst} ${maskLast}`
  }
  return maskFirst || maskLast || '******'
}

/**
 * Masks an employee name (full name as single string)
 * @param employeeName - Full name string like "John Doe" or "John"
 * @returns Masked name like "J***** D**" or "J****"
 */
export function maskEmployeeName(employeeName?: string): string {
  if (!employeeName || employeeName === 'N/A') {
    return '******'
  }
  
  const trimmed = employeeName.trim()
  if (!trimmed) {
    return '******'
  }
  
  // Split by space to get first and last name
  const parts = trimmed.split(/\s+/)
  if (parts.length === 1) {
    // Single name
    const name = parts[0]
    return name.length > 1
      ? name.charAt(0).toUpperCase() + '*'.repeat(Math.max(1, name.length - 1))
      : '*'
  }
  
  // Multiple parts - treat first as first name, rest as last name
  const firstName = parts[0]
  const lastName = parts.slice(1).join(' ')
  
  return maskName(firstName, lastName)
}

/**
 * Masks an email address
 * @param email - Email address
 * @returns Masked email like "j*******@domain.com"
 */
export function maskEmail(email?: string): string {
  if (!email) {
    return '******@****.***'
  }
  
  const [localPart, domain] = email.split('@')
  if (!domain) {
    // Invalid email format, mask entire string
    return '*'.repeat(Math.min(email.length, 10)) + '@****.***'
  }
  
  // Mask local part (before @)
  const maskedLocal = localPart.length > 1
    ? localPart.charAt(0) + '*'.repeat(Math.max(1, localPart.length - 1))
    : '*'
  
  return `${maskedLocal}@${domain}`
}

/**
 * Masks a phone number
 * @param phone - Phone number
 * @returns Masked phone like "*******123" (shows last 2-3 digits)
 */
export function maskPhone(phone?: string): string {
  if (!phone) {
    return '*******'
  }
  
  // Remove all non-digit characters
  const digitsOnly = phone.replace(/\D/g, '')
  
  if (digitsOnly.length <= 3) {
    // Very short number, mask all but last digit
    return '*'.repeat(Math.max(1, digitsOnly.length - 1)) + digitsOnly.slice(-1)
  }
  
  // Show last 2-3 digits, mask the rest
  const showDigits = Math.min(3, Math.max(2, Math.floor(digitsOnly.length * 0.2)))
  const masked = '*'.repeat(digitsOnly.length - showDigits) + digitsOnly.slice(-showDigits)
  
  return masked
}

/**
 * Masks an address line
 * @param address - Address line
 * @returns Masked address like "123 M**** Street"
 */
export function maskAddressLine(address?: string): string {
  if (!address) {
    return '******'
  }
  
  const words = address.trim().split(/\s+/)
  if (words.length === 0) {
    return '******'
  }
  
  // Mask middle words, keep first and last word partially visible
  const maskedWords = words.map((word, index) => {
    if (index === 0) {
      // First word: show first character, mask rest
      return word.length > 1
        ? word.charAt(0).toUpperCase() + '*'.repeat(Math.max(1, word.length - 1))
        : '*'
    } else if (index === words.length - 1) {
      // Last word: show first character, mask rest
      return word.length > 1
        ? word.charAt(0).toUpperCase() + '*'.repeat(Math.max(1, word.length - 1))
        : '*'
    } else {
      // Middle words: mask completely
      return '*'.repeat(Math.min(word.length, 5))
    }
  })
  
  return maskedWords.join(' ')
}

/**
 * Masks an address (alias for maskAddressLine for backward compatibility)
 * @param address - Address string
 * @returns Masked address like "123 M**** Street"
 */
export function maskAddress(address?: string): string {
  return maskAddressLine(address)
}

/**
 * Masks a city name
 * @param city - City name
 * @returns Masked city like "M******"
 */
export function maskCity(city?: string): string {
  if (!city) {
    return '******'
  }
  
  if (city.length <= 2) {
    return '*'.repeat(city.length)
  }
  
  return city.charAt(0).toUpperCase() + '*'.repeat(Math.max(1, city.length - 1))
}

/**
 * Masks a pincode (shows only first 2 digits)
 * @param pincode - Pincode
 * @returns Masked pincode like "60****"
 */
export function maskPincode(pincode?: string): string {
  if (!pincode) {
    return '******'
  }
  
  const digitsOnly = pincode.replace(/\D/g, '')
  if (digitsOnly.length <= 2) {
    return '*'.repeat(digitsOnly.length)
  }
  
  return digitsOnly.slice(0, 2) + '*'.repeat(digitsOnly.length - 2)
}

/**
 * Masks a designation/role
 * @param designation - Designation
 * @returns Masked designation like "B***** M******"
 */
export function maskDesignation(designation?: string): string {
  if (!designation) {
    return '******'
  }
  
  const words = designation.trim().split(/\s+/)
  const maskedWords = words.map(word => {
    if (word.length <= 1) {
      return '*'
    }
    return word.charAt(0).toUpperCase() + '*'.repeat(Math.max(1, word.length - 1))
  })
  
  return maskedWords.join(' ')
}

/**
 * Masks an entire employee object for vendor access
 * @param employee - Employee object
 * @returns Employee object with masked PII fields
 */
export function maskEmployeeData(employee: any): any {
  if (!employee) {
    return employee
  }
  
  const masked = { ...employee }
  
  // Mask name fields
  masked.firstName = maskName(employee.firstName, employee.lastName).split(' ')[0] || '******'
  masked.lastName = maskName(employee.firstName, employee.lastName).split(' ')[1] || '******'
  
  // Mask email
  masked.email = maskEmail(employee.email)
  
  // Mask phone
  masked.mobile = maskPhone(employee.mobile)
  
  // Mask designation
  masked.designation = maskDesignation(employee.designation)
  
  // Mask address fields
  if (employee.address_line_1) {
    masked.address_line_1 = maskAddressLine(employee.address_line_1)
  }
  if (employee.address_line_2) {
    masked.address_line_2 = maskAddressLine(employee.address_line_2)
  }
  if (employee.address_line_3) {
    masked.address_line_3 = maskAddressLine(employee.address_line_3)
  }
  if (employee.city) {
    masked.city = maskCity(employee.city)
  }
  if (employee.state) {
    masked.state = maskCity(employee.state) // Use same masking as city
  }
  if (employee.pincode) {
    masked.pincode = maskPincode(employee.pincode)
  }
  
  // Mask legacy address field if present
  if (employee.address && typeof employee.address === 'string') {
    masked.address = maskAddressLine(employee.address)
  }
  
  // Mask location field if present
  if (employee.location && typeof employee.location === 'string') {
    masked.location = maskAddressLine(employee.location)
  }
  
  return masked
}

/**
 * Masks an array of employees for vendor access
 * @param employees - Array of employee objects
 * @returns Array of employees with masked PII fields
 */
export function maskEmployeesData(employees: any[]): any[] {
  if (!employees || !Array.isArray(employees)) {
    return employees || []
  }
  
  return employees.map(employee => maskEmployeeData(employee))
}
