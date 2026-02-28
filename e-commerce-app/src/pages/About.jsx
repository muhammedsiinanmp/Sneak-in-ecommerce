import React from 'react'

const About = () => {
  return (
    <div className="pt-20 px-6 sm:px-12 lg:px-32 text-gray-800">

      {/* Header */}
      <h1 className="text-3xl sm:text-4xl font-bold mb-4 tracking-wide">
        About <span className="text-gray-500">Us</span>
      </h1>
      <div className="w-20 h-1 bg-black rounded mb-10"></div>

      {/* Section 1 - Story */}
      <div className="space-y-6 mb-16 max-w-3xl">
        <h2 className="text-2xl font-semibold">Our Story</h2>
        <p className="text-lg leading-relaxed text-gray-700">
          At <span className="font-semibold">Sneak-IN</span>, we believe sneakers are more than just 
          footwear — they’re culture, identity, and a statement. What started as a 
          passion for streetwear has grown into a dedicated marketplace bringing 
          you the latest drops, timeless classics, and exclusive styles all in one place.
        </p>
        <p className="text-lg leading-relaxed text-gray-700">
          We noticed how difficult it was for sneaker lovers in India to find 
          authentic, high-quality sneakers at fair prices. So we made it our mission 
          to create a platform that delivers not only premium products but also a 
          premium shopping experience.
        </p>
      </div>

      {/* Section 2 - What We Stand For */}
      <div className="space-y-6 mb-16">
        <h2 className="text-2xl font-semibold">What We Stand For</h2>

        <div className="grid sm:grid-cols-2 gap-8 lg:grid-cols-3">
          <div className="p-6 border rounded-lg shadow-sm hover:shadow-md transition">
            <h3 className="text-xl font-semibold mb-2">100% Authentic</h3>
            <p className="text-gray-700">
              Every sneaker we sell is verified for authenticity. No replicas. No compromises.
            </p>
          </div>

          <div className="p-6 border rounded-lg shadow-sm hover:shadow-md transition">
            <h3 className="text-xl font-semibold mb-2">Fair Pricing</h3>
            <p className="text-gray-700">
              Premium doesn’t have to be overpriced. We keep margins low so you get real value.
            </p>
          </div>

          <div className="p-6 border rounded-lg shadow-sm hover:shadow-md transition">
            <h3 className="text-xl font-semibold mb-2">Fast Delivery</h3>
            <p className="text-gray-700">
              Our logistics team ensures quick, safe, and reliable shipment across the country.
            </p>
          </div>

          <div className="p-6 border rounded-lg shadow-sm hover:shadow-md transition">
            <h3 className="text-xl font-semibold mb-2">Easy Shopping</h3>
            <p className="text-gray-700">
              Clean interface, smooth checkout, size guides — everything built for comfort.
            </p>
          </div>

          <div className="p-6 border rounded-lg shadow-sm hover:shadow-md transition">
            <h3 className="text-xl font-semibold mb-2">Customer First</h3>
            <p className="text-gray-700">
              Need help? Our support team is always ready to assist you with orders and sizing.
            </p>
          </div>
        </div>
      </div>

      {/* Section 3 - Why Sneak-IN */}
      <div className="space-y-6 max-w-3xl mb-20">
        <h2 className="text-2xl font-semibold">Why Sneak-IN?</h2>
        <ul className="space-y-3 text-lg text-gray-700 list-disc pl-6">
          <li>Curated selection from top sneaker brands</li>
          <li>Secure checkout & multiple payment options</li>
          <li>New releases added frequently</li>
          <li>Dedicated support for sneaker enthusiasts</li>
          <li>Trusted by sneaker lovers across India</li>
        </ul>
      </div>

      {/* Footer */}
      <div className="pb-20">
        <h3 className="text-xl font-semibold">Thank You for Being Here</h3>
        <p className="text-gray-700 text-lg mt-2">
          We're here to make your sneaker journey smoother, easier, and more exciting.
          Whether you're a collector or someone buying their first pair — 
          <span className="font-semibold"> Sneak-IN has your back.</span>
        </p>
      </div>

    </div>
  )
}

export default About
