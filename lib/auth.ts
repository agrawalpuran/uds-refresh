import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'

// Hardcoded OTP for demo — replace with real verification when SMS is implemented
const DEMO_OTP = '123456'

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        otp: { label: 'OTP', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.otp) return null

        const email = (credentials.email as string).toLowerCase().trim()
        const otp = credentials.otp as string

        if (otp !== DEMO_OTP) return null

        // Dynamic imports so Mongoose is only loaded during sign-in (Node.js context),
        // not when middleware evaluates this module (Edge Runtime context)
        const connectDB = (await import('./db/mongodb')).default
        const User = (await import('./models/User')).default

        await connectDB()
        const user = await User.findOne({ email, isActive: true })
        if (!user) return null

        user.lastLoginAt = new Date()
        await user.save()

        return {
          id: user._id.toString(),
          email: user.email,
          role: user.role,
          companyId: user.companyId,
          vendorId: user.vendorId,
          employeeId: user.employeeId,
        }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = user.role
        token.companyId = user.companyId
        token.vendorId = user.vendorId
        token.employeeId = user.employeeId
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub
        session.user.role = token.role
        session.user.companyId = token.companyId
        session.user.vendorId = token.vendorId
        session.user.employeeId = token.employeeId
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
  session: { strategy: 'jwt' },
})
