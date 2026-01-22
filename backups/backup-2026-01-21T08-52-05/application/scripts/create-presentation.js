const PptxGenJS = require('pptxgenjs')

async function createPresentation() {
  const pptx = new PptxGenJS()
  
  // Set presentation properties
  pptx.author = 'Uniform Distribution System'
  pptx.company = 'CSG Systems'
  pptx.title = 'Uniform Distribution System'
  pptx.subject = 'Product Presentation'
  
  // SLIDE 1: The Solution
  const slide1 = pptx.addSlide()
  
  // Title
  slide1.addText('Uniform Distribution System', {
    x: 0.5,
    y: 0.5,
    w: 9,
    h: 0.8,
    fontSize: 44,
    bold: true,
    color: '1F4788',
    align: 'center',
  })
  
  // Subtitle
  slide1.addText('Automate. Track. Manage.', {
    x: 0.5,
    y: 1.5,
    w: 9,
    h: 0.5,
    fontSize: 24,
    italic: true,
    color: '666666',
    align: 'center',
  })
  
  // What It Does
  slide1.addText('What It Does', {
    x: 0.5,
    y: 2.3,
    w: 9,
    h: 0.4,
    fontSize: 28,
    bold: true,
    color: '1F4788',
  })
  
  slide1.addText('A cloud-based platform that automates uniform distribution for companies with distributed workforces.', {
    x: 0.5,
    y: 2.8,
    w: 9,
    h: 0.6,
    fontSize: 18,
    color: '333333',
    bullet: false,
  })
  
  // Key Features
  slide1.addText('Key Features', {
    x: 0.5,
    y: 3.6,
    w: 9,
    h: 0.4,
    fontSize: 28,
    bold: true,
    color: '1F4788',
  })
  
  const features = [
    { text: 'Automated Eligibility Tracking - Know who can order what, when' },
    { text: 'Multi-Role Dashboards - Separate portals for Admins, Employees, Vendors' },
    { text: 'Approval Workflow - Streamlined order approvals with real-time tracking' },
    { text: 'Bulk Operations - Process hundreds of employees in minutes' },
    { text: 'Cloud-Based - Access from anywhere, secure and scalable' }
  ]
  
  slide1.addText(features, {
    x: 0.8,
    y: 4.1,
    w: 8.4,
    h: 2.5,
    fontSize: 16,
    color: '333333',
    bullet: { type: 'number', code: '1.' },
    lineSpacing: 28,
  })
  
  // Perfect For
  slide1.addText('Perfect For', {
    x: 0.5,
    y: 6.8,
    w: 9,
    h: 0.4,
    fontSize: 20,
    bold: true,
    color: '1F4788',
  })
  
  slide1.addText('Airlines | Hospitality | Retail | Healthcare | Any organization managing uniforms', {
    x: 0.5,
    y: 7.3,
    w: 9,
    h: 0.5,
    fontSize: 16,
    color: '666666',
    align: 'center',
    italic: true,
  })
  
  // SLIDE 2: The Benefits
  const slide2 = pptx.addSlide()
  
  // Title
  slide2.addText('Why Choose This System', {
    x: 0.5,
    y: 0.5,
    w: 9,
    h: 0.8,
    fontSize: 44,
    bold: true,
    color: '1F4788',
    align: 'center',
  })
  
  // Business Impact
  slide2.addText('Business Impact', {
    x: 0.5,
    y: 1.8,
    w: 4.5,
    h: 0.5,
    fontSize: 28,
    bold: true,
    color: '1F4788',
  })
  
  const benefits = [
    { icon: '⚡', text: 'Save Time - Reduce administrative work by 60%+' },
    { icon: '💰', text: 'Control Costs - Enforce eligibility rules automatically' },
    { icon: '📊', text: 'Gain Visibility - Real-time tracking of all operations' },
    { icon: '🔒', text: 'Ensure Compliance - Complete audit trails' },
    { icon: '📈', text: 'Scale Easily - Grows with your organization' }
  ]
  
  benefits.forEach((benefit, index) => {
    slide2.addText(`${benefit.icon} ${benefit.text}`, {
      x: 0.8,
      y: 2.4 + (index * 0.6),
      w: 4.2,
      h: 0.5,
      fontSize: 16,
      color: '333333',
      bullet: false,
    })
  })
  
  // Technology
  slide2.addText('Technology', {
    x: 5.5,
    y: 1.8,
    w: 4.5,
    h: 0.5,
    fontSize: 28,
    bold: true,
    color: '1F4788',
  })
  
  const techPoints = [
    { text: 'Modern Stack - Next.js, MongoDB, Cloud Infrastructure' },
    { text: 'Enterprise-Grade - Secure, reliable, fast' },
    { text: 'Quick Implementation - 2-3 weeks to go-live' },
    { text: 'Ongoing Support - Training and updates included' }
  ]
  
  slide2.addText(techPoints, {
    x: 5.8,
    y: 2.4,
    w: 4.2,
    h: 2.4,
    fontSize: 16,
    color: '333333',
    bullet: { type: 'number', code: '1.' },
    lineSpacing: 28,
  })
  
  // Next Steps
  slide2.addText('Next Steps', {
    x: 0.5,
    y: 5.8,
    w: 9,
    h: 0.5,
    fontSize: 28,
    bold: true,
    color: '1F4788',
  })
  
  slide2.addText('📞 Demo - See it in action  |  🎨 Customize - Tailored to your needs  |  🚀 Deploy - Fast implementation', {
    x: 0.5,
    y: 6.4,
    w: 9,
    h: 0.6,
    fontSize: 18,
    color: '333333',
    align: 'center',
    bold: true,
  })
  
  // Footer
  slide2.addText('Ready to transform your uniform distribution process?', {
    x: 0.5,
    y: 7.2,
    w: 9,
    h: 0.5,
    fontSize: 20,
    color: '1F4788',
    align: 'center',
    italic: true,
    bold: true,
  })
  
  // SLIDE 3: System Overview (Optional - can be removed if you want only 2 slides)
  const slide3 = pptx.addSlide()
  
  slide3.addText('System Overview', {
    x: 0.5,
    y: 0.5,
    w: 9,
    h: 0.8,
    fontSize: 44,
    bold: true,
    color: '1F4788',
    align: 'center',
  })
  
  // For Administrators
  slide3.addText('For Administrators', {
    x: 0.5,
    y: 1.8,
    w: 4.5,
    h: 0.5,
    fontSize: 24,
    bold: true,
    color: '1F4788',
  })
  
  const adminFeatures = [
    { text: 'Real-time dashboard analytics' },
    { text: 'Bulk employee management' },
    { text: 'Streamlined approval workflow' },
    { text: 'Catalog and inventory control' }
  ]
  
  slide3.addText(adminFeatures, {
    x: 0.8,
    y: 2.4,
    w: 4.2,
    h: 2,
    fontSize: 16,
    color: '333333',
    bullet: { type: 'number', code: '1.' },
  })
  
  // For Employees
  slide3.addText('For Employees', {
    x: 5.5,
    y: 1.8,
    w: 4.5,
    h: 0.5,
    fontSize: 24,
    bold: true,
    color: '1F4788',
  })
  
  const employeeFeatures = [
    { text: 'Self-service ordering portal' },
    { text: 'Clear eligibility visibility' },
    { text: 'Mobile-friendly access' },
    { text: 'Complete order history' }
  ]
  
  slide3.addText(employeeFeatures, {
    x: 5.8,
    y: 2.4,
    w: 4.2,
    h: 2,
    fontSize: 16,
    color: '333333',
    bullet: { type: 'number', code: '1.' },
  })
  
  // Key Metrics
  slide3.addText('Key Metrics', {
    x: 0.5,
    y: 4.8,
    w: 9,
    h: 0.5,
    fontSize: 24,
    bold: true,
    color: '1F4788',
  })
  
  slide3.addText('60%+ Time Savings  |  2-3 Weeks Implementation  |  99.9% Uptime  |  Multi-Company Support', {
    x: 0.5,
    y: 5.4,
    w: 9,
    h: 0.6,
    fontSize: 18,
    color: '333333',
    align: 'center',
    bold: true,
  })
  
  // Save the presentation
  const filename = 'Uniform-Distribution-System-Presentation.pptx'
  await pptx.writeFile({ fileName: filename })
  console.log(`\n✅ PowerPoint presentation created: ${filename}`)
  console.log(`📁 Location: ${process.cwd()}\\${filename}\n`)
}

createPresentation().catch(console.error)

