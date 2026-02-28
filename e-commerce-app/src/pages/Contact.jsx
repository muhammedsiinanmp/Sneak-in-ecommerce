import React from 'react'

const Contact = () => {
  return (
    <div className="pt-20 px-6 sm:px-12 lg:px-32 text-gray-800">

      {/* Header */}
      <h1 className="text-3xl sm:text-4xl font-bold mb-4 tracking-wide">
        Contact <span className="text-gray-500">Us</span>
      </h1>
      <div className="w-20 h-1 bg-black rounded mb-10"></div>

      {/* Description */}
      <p className="text-lg text-gray-700 max-w-2xl mb-12">
        Have questions about sneakers, sizing, or your order?  
        We're always here to help. Reach out to us using the details below.
      </p>

      {/* Contact Details */}
      <div className="space-y-12">

        {/* Customer Support */}
        <div>
          <h2 className="text-2xl font-semibold mb-3">Customer Support</h2>
          <p className="text-gray-700 text-lg">
            Email: <span className="font-medium">support@sneak-in.com</span>
          </p>
          <p className="text-gray-700 text-lg">
            Phone: <span className="font-medium">+91 98765 43210</span>
          </p>
        </div>

        {/* Business Hours */}
        <div>
          <h2 className="text-2xl font-semibold mb-3">Business Hours</h2>
          <p className="text-gray-700 text-lg">Monday – Friday: 10 AM – 7 PM</p>
          <p className="text-gray-700 text-lg">Saturday: 11 AM – 5 PM</p>
          <p className="text-gray-700 text-lg">Sunday: Closed</p>
        </div>

        {/* Office Address */}
        <div>
          <h2 className="text-2xl font-semibold mb-3">Office Address</h2>
          <p className="text-gray-700 text-lg">Sneak-IN Headquarters</p>
          <p className="text-gray-700 text-lg">Bangalore, Karnataka, India</p>
          <p className="text-gray-700 text-lg">PIN: 560001</p>
        </div>

      </div>

      <div className="py-20"></div>
    </div>
  )
}

export default Contact
