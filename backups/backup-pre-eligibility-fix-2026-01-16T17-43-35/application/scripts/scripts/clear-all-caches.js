/**
 * Script to clear browser localStorage caches for relationship data
 * This helps ensure the UI shows fresh data from the database
 */

console.log('📋 Instructions to clear caches:')
console.log('')
console.log('1. Open your browser Developer Tools (F12)')
console.log('2. Go to the Console tab')
console.log('3. Run these commands:')
console.log('')
console.log('   // Clear all relationship caches')
console.log('   localStorage.removeItem("productCompanies")')
console.log('   localStorage.removeItem("productVendors")')
console.log('   localStorage.removeItem("vendorCompanies")')
console.log('')
console.log('   // Clear all localStorage (if you want a complete reset)')
console.log('   localStorage.clear()')
console.log('')
console.log('4. Refresh the page (Ctrl+R or F5)')
console.log('')
console.log('Alternatively, you can clear caches programmatically by:')
console.log('- Opening the browser console')
console.log('- Running: localStorage.clear()')
console.log('- Refreshing the page')



