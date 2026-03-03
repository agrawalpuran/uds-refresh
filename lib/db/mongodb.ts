import mongoose from 'mongoose'

// CRITICAL: Auto-encode special characters in MongoDB password to prevent "Password contains unescaped characters" error
function sanitizeMongoDBUri(uri: string): string {
  if (!uri) return uri
  
  // Pattern to match: mongodb://username:password@host/database
  // We need to URL-encode only the password part, not the entire URI
  const uriPattern = /^(mongodb\+?srv?:\/\/)([^:]+):([^@]+)@(.+)$/
  const match = uri.match(uriPattern)
  
  if (match) {
    const [, protocol, username, password, rest] = match
    
    // Check if password already contains encoded characters (starts with %)
    // If it does, assume it's already encoded
    if (password.includes('%')) {
      console.log('[MongoDB URI] Password appears to be already URL-encoded')
      return uri
    }
    
    // URL-encode special characters in password
    // Common special characters that need encoding: @ # $ % & + / ? = [ ] { } | \ ^ ~ ` < > " '
    const encodedPassword = encodeURIComponent(password)
    
    // Only rebuild URI if password was actually changed
    if (encodedPassword !== password) {
      console.log('[MongoDB URI] Auto-encoding special characters in password')
      const sanitizedUri = `${protocol}${username}:${encodedPassword}@${rest}`
      return sanitizedUri
    }
  }
  
  return uri
}

let MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable inside .env.local')
}

// CRITICAL FIX: Auto-sanitize MongoDB URI to handle special characters in password
MONGODB_URI = sanitizeMongoDBUri(MONGODB_URI)

interface MongooseCache {
  conn: typeof mongoose | null
  promise: Promise<typeof mongoose> | null
}

declare global {
  var mongoose: MongooseCache | undefined
}

let cached: MongooseCache = globalThis.mongoose || { conn: null, promise: null }

if (!globalThis.mongoose) {
  globalThis.mongoose = cached
}

async function connectDB(): Promise<typeof mongoose> {
  if (cached.conn) {
    return cached.conn
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      serverSelectionTimeoutMS: 10000, // 10 seconds timeout
      socketTimeoutMS: 45000, // 45 seconds socket timeout
      maxPoolSize: 50, // Limit connections per process to prevent Atlas exhaustion under load
      minPoolSize: 5, // Keep a warm pool for faster request handling
    }

    // Log connection attempt (without exposing password)
    const maskedUri = MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@')
    console.log('🔌 Attempting MongoDB connection...')
    console.log(`📍 URI: ${maskedUri}`)
    console.log(`[MongoDB] Using sanitized URI (password auto-encoded if needed)`)

    cached.promise = mongoose.connect(MONGODB_URI, {
      ...opts,
      // Disable strict populate to allow populating fields that may not be strictly defined
    })
      .then((mongoose) => {
        console.log('✅ MongoDB Connected Successfully')
        if (mongoose.connection.db) {
          console.log(`📊 Database: ${mongoose.connection.db.databaseName}`)
        }
        // Ensure models are registered
        if (!mongoose.models.Branch) {
          require('../models/Branch')
        }
        if (!mongoose.models.DesignationProductEligibility) {
          require('../models/DesignationProductEligibility')
        }
        return mongoose
      })
      .catch((error) => {
        console.error('❌ MongoDB Connection Failed:')
        console.error(`   Error: ${error.message}`)
        
        // CRITICAL: Handle "Password contains unescaped characters" error
        if (error.message && error.message.includes('Password contains unescaped characters')) {
          console.error('   💡 CRITICAL: MongoDB password contains special characters that need URL encoding')
          console.error('   💡 Solution: URL-encode special characters in your MongoDB password')
          console.error('   💡 Example: If password is "p@ss#word", use "p%40ss%23word" in MONGODB_URI')
          console.error('   💡 Common characters to encode: @ = %40, # = %23, $ = %24, & = %26, + = %2B, / = %2F, ? = %3F')
          const connectionError = new Error('MongoDB connection string has unescaped characters in password. Please URL-encode special characters in your MONGODB_URI.')
          connectionError.name = 'MongoParseError'
          throw connectionError
        }
        
        if (error.message.includes('authentication')) {
          console.error('   💡 Check your username and password in MONGODB_URI')
        } else if (error.message.includes('timeout')) {
          console.error('   💡 Check network access in MongoDB Atlas (IP whitelist)')
        } else if (error.message.includes('ENOTFOUND') || error.message.includes('getaddrinfo')) {
          console.error('   💡 Check your MongoDB Atlas cluster URL')
        }
        throw error
      })
  }

  try {
    cached.conn = await cached.promise
  } catch (e) {
    cached.promise = null
    // Re-throw with more context
    const error = e as Error
    console.error('❌ Failed to establish MongoDB connection')
    console.error(`   ${error.message}`)
    throw error
  }

  return cached.conn
}

export default connectDB




