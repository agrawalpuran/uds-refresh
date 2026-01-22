/**
 * Image Mapping Utility
 * Centralized function for mapping product categories and genders to image paths
 * 
 * This function determines which image to display based on:
 * - Product category (shirt, pant, shoe, jacket)
 * - Product gender (male, female, unisex)
 * - Optional: Product name (for product-specific images)
 * 
 * Images are stored in: public/images/uniforms/
 * Base URL path: /images/uniforms/
 */

export function getIndigoUniformImage(
  category: string, 
  gender: string = 'male',
  productName?: string
): string {
  // Normalize category name (handle both 'pant' and 'trouser')
  const normalizedCategory = category.toLowerCase() === 'trouser' ? 'pant' : category.toLowerCase()
  const normalizedGender = gender.toLowerCase()
  
  // Normalize product name for use throughout the function
  const normalizedProductName = productName ? productName.toLowerCase().trim() : ''
  
  // Product-specific images based on name (highest priority)
  if (normalizedProductName) {
    // Oxford Shirt - Male (check for "oxford" and "shirt" in name)
    if ((normalizedProductName.includes('oxford') && normalizedProductName.includes('shirt')) && 
        (normalizedGender === 'male' || normalizedGender === 'unisex')) {
      return '/images/uniforms/shirt-male-oxford.jpg'
    }
    
    // Denim Shirt - Male (check for "denim" and "shirt" in name)
    if ((normalizedProductName.includes('denim') && normalizedProductName.includes('shirt')) && 
        (normalizedGender === 'male' || normalizedGender === 'unisex')) {
      return '/images/uniforms/denim-shirt-male.jpg'
    }
    
    // Cargo pants use cargo-male.jpg
    if (normalizedProductName.includes('cargo') && normalizedCategory === 'pant') {
      return '/images/uniforms/cargo-male.jpg'
    }
    
    // Tie products use tie-specific image
    if (normalizedProductName.includes('tie')) {
      return '/images/uniforms/tie-unisex.jpg'
    }
    
    // Loafers use lofer-male.jpg (note: filename has typo "lofer" instead of "loafer")
    if (normalizedProductName.includes('loafer') && normalizedCategory === 'shoe') {
      return '/images/uniforms/lofer-male.jpg'
    }
  }
  
  // Special case: female shirt uses female-shirt.png
  if (normalizedCategory === 'shirt' && normalizedGender === 'female') {
    return '/images/uniforms/female-shirt.png'
  }
  
  // Special case: male jacket uses male-blazer.jpg
  if (normalizedCategory === 'jacket' && normalizedGender === 'male') {
    return '/images/uniforms/male-blazer.jpg'
  }
  
  // Special case: male pant uses pant-male.png
  if (normalizedCategory === 'pant' && normalizedGender === 'male') {
    return '/images/uniforms/pant-male.png'
  }
  
  // Special case: female pant uses pant-female
  if (normalizedCategory === 'pant' && normalizedGender === 'female') {
    return '/images/uniforms/pant-female.jpg'
  }
  
  // Special case: female jacket uses jacket-female
  if (normalizedCategory === 'jacket' && normalizedGender === 'female') {
    return '/images/uniforms/jacket-female.jpg'
  }
  
  // Special case: male shoes use shoe-male.jpg
  // Note: If product name contains "loafer", use lofer-male.jpg (filename has typo)
  if (normalizedCategory === 'shoe' && normalizedGender === 'male') {
    // Check if product name contains "loafer" to use the specific loafer image
    if (normalizedProductName.includes('loafer')) {
      return '/images/uniforms/lofer-male.jpg'
    }
    // Default to shoe-male.jpg for other male shoes
    return '/images/uniforms/shoe-male.jpg'
  }
  
  // Special case: female shoes use shoe-female.jpg
  if (normalizedCategory === 'shoe' && normalizedGender === 'female') {
    return '/images/uniforms/shoe-female.jpg'
  }
  
  // Special case: unisex shoes use shoe-unisex.jpg
  if (normalizedCategory === 'shoe' && normalizedGender === 'unisex') {
    return '/images/uniforms/shoe-unisex.jpg'
  }
  
  // Special case: tie uses tie-unisex.jpg (check category first)
  if (normalizedCategory === 'tie') {
    return '/images/uniforms/tie-unisex.jpg'
  }
  
  // Special case: belt uses unisex-belt.jpg
  if (normalizedCategory === 'belt') {
    return '/images/uniforms/unisex-belt.jpg'
  }
  
  // Special case: other accessories (not tie, not belt) use unisex-belt.jpg as fallback
  if (normalizedCategory === 'accessory') {
    // If product name contains "tie", use tie image
    if (normalizedProductName.includes('tie')) {
      return '/images/uniforms/tie-unisex.jpg'
    }
    // Otherwise use belt as default for accessories
    return '/images/uniforms/unisex-belt.jpg'
  }
  
  // Default pattern: {category}-{gender}.jpg
  // Images should be stored in public/images/uniforms/
  // Naming convention: {category}-{gender}.jpg (e.g., shirt-male.jpg, pant-female.jpg)
  const imagePath = `/images/uniforms/${normalizedCategory}-${normalizedGender}.jpg`
  
  return imagePath
}

/**
 * Ensures image path is always from /images/uniforms folder
 * If product has an image field, validates it's from /images/uniforms
 * Otherwise falls back to category-based mapping
 */
export function getUniformImage(
  productImage: string | undefined | null,
  category: string,
  gender: string = 'male',
  productName?: string
): string {
  // Normalize inputs - handle null/undefined
  const normalizedCategory = (category || '').toLowerCase().trim()
  const normalizedGender = (gender || 'male').toLowerCase().trim()
  const normalizedProductName = (productName || '').toLowerCase().trim()
  
  // ALWAYS use category-based mapping as the single source of truth
  // This ensures images correctly match the product category and gender
  // The database image field is ignored to prevent incorrect images
  // All images come from /images/uniforms folder based on category/gender/name
  return getIndigoUniformImage(normalizedCategory, normalizedGender, normalizedProductName)
}

/**
 * Configuration for image paths
 * Modify these constants to change the base path or folder structure
 */
export const IMAGE_CONFIG = {
  // Base path for all uniform images
  BASE_PATH: '/images/uniforms/',
  
  // Physical directory (for reference)
  PHYSICAL_DIR: 'public/images/uniforms/',
  
  // Default fallback image
  DEFAULT_IMAGE: '/images/uniforms/default.jpg',
  
  // Image file extensions to try (in order)
  EXTENSIONS: ['.jpg', '.png', '.webp', '.jpeg'],
}

