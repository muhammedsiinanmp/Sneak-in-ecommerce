import React from 'react'

const Loading = () => {
  return (
    <div className='flex items-center justify-center min-h-[60vh] w-full'>
      <div className='flex flex-col items-center gap-4'>
        {/* Main Spinner */}
        <div className='relative w-16 h-16'>
          <div className='absolute inset-0 border-4 border-gray-100 rounded-full'></div>
          <div className='absolute inset-0 border-4 border-black border-t-transparent rounded-full animate-custom-spin'></div>
        </div>
        
        {/* Subtle Text with Pulse Effect */}
        <p className='text-sm font-medium tracking-widest text-gray-400 animate-custom-pulse'>
          LOADING COLLECTIONS
        </p>
        
        {/* Visual Decoration */}
        <div className='flex gap-1'>
          <div className='w-1 h-1 bg-gray-300 rounded-full animate-custom-bounce [animation-delay:-0.3s]'></div>
          <div className='w-1 h-1 bg-gray-300 rounded-full animate-custom-bounce [animation-delay:-0.15s]'></div>
          <div className='w-1 h-1 bg-gray-300 rounded-full animate-custom-bounce'></div>
        </div>
      </div>
    </div>
  )
}

export default Loading
