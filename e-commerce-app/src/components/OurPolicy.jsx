import React from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faExchangeAlt } from '@fortawesome/free-solid-svg-icons'  // Use this icon instead

const OurPolicy = () => {
    return (
        <div className='flex flex-col sm:flex-row justify-around gap-12 sm:gap-2 text-center py-20 text-xs sm:text-sm md:text-base text-gray-700'>
            <div>
                <img src="https://cdn-icons-png.flaticon.com/128/10044/10044783.png" alt="" className='w-10 m-auto mb-5' />
                <p className='font-semibold'>Easy Exchange Policy</p>
                <p className='text-gray-400'>We offer hassle free exchange policy</p>
            </div>
            <div>
                <img src="https://cdn-icons-png.flaticon.com/128/5465/5465643.png" className='w-10 m-auto mb-5' />
                <p className='font-semibold'>7 Days Return Policy</p>
                <p className='text-gray-400'>We provide 7 days free return policy</p>
            </div>
            <div>
                <img src="https://cdn-icons-png.flaticon.com/128/4526/4526832.png" className='w-10 m-auto mb-5' alt="" />
                <p className='font-semibold'>Best customer support</p>
                <p className='text-gray-400'>We provide 24/7 customer support</p>
            </div>
        </div>
    )
}

export default OurPolicy
