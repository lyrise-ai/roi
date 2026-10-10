export function isEmployeeEmail(email) {
  return typeof email === 'string' && email.toLowerCase().endsWith('@lyrise.ai')
}

export function isEmployeeUser(user, userData) {
  return userData?.role === 'EMPLOYEE' || isEmployeeEmail(user?.email)
}
