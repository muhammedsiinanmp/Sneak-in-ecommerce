import React from 'react'

const Footer = () => {
    return (
        <div >
            <div className='flex flex-col sm:grid grid-cols-[3fr_1fr_1fr] gap-14 my-10 mt-40 text-sm'>

                <div>
                    <img src="/Sneak_logo.png" className='w-32 mb-5 rounded'></img>
                    <p className='w-full md:w-2/3 text-gray-600'>
                        Discover the newest arrivals crafted to elevate every step.
                        Our latest collection blends cutting-edge design with unmatched comfort, bringing fresh styles for every occasion.
                        Explore the trends of today and be the first to wear tomorrow’s favorites.
                    </p>
                </div>

                <div>
                    <p className='text-xl font-medium mb-5'>COMPANY</p>
                    <ul className='flex flex-col gap-1 text-gray-600'>
                        <li>Home</li>
                        <li>About us</li>
                        <li>Delivery</li>
                        <li>Privacy Policy</li>
                    </ul>
                </div>

                <div>
                    <p className='text-xl font-medium mb-5'>GET IN TOUCH</p>
                    <ul className='flex flex-col gap-1 text-gray-600'>
                        <li>+91 7864382495</li>
                        <li>contact@sneakin.com</li>
                    </ul>
                </div>

            </div>

            <div >
                <hr />
                <p className='py-5 text-sm text-center'>Copyright 2025@ sneakin.com - All Right Reserved</p>
            </div>

        </div>
    )
}

export default Footer
