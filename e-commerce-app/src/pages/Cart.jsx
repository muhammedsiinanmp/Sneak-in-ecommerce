import React, { useContext, useState } from 'react'
import { ShopContext } from '../context/ShopContext'
import Title from '../components/Title'
import CartTotal from '../components/CartTotal'
import { toast } from "react-toastify";

const Cart = () => {
  const { products, currency, cartItems, updateQuantity, navigate } = useContext(ShopContext)

  return (
    <div className='border-t pt-14'>
      <div className='text-2xl mb-3'>
        <Title text1={'YOUR '} text2={'CART'} />
      </div>

      {/* Empty Cart State */}
      {cartItems.length === 0 ? (
        <div className='flex flex-col items-center justify-center py-20'>
          <img
            src='https://cdn-icons-png.flaticon.com/128/11329/11329060.png'
            alt='Empty Cart'
            className='w-32 h-32 mb-6 opacity-50'
          />
          <h2 className='text-2xl font-medium text-gray-700 mb-2'>Your Cart is Empty</h2>
          <p className='text-gray-500 mb-6'>Looks like you haven't added anything to your cart yet.</p>
          <button
            onClick={() => navigate('/collection')}
            className='bg-black text-white px-8 py-3 hover:bg-gray-800 transition'
          >
            CONTINUE SHOPPING
          </button>
        </div>
      ) : (
        <>
          {/* Cart Items */}
          <div>
            {cartItems.map((item) => {
              const productInfo = item.product_detail;
              if (!productInfo) return null;

              return (
                <div key={item.id} className='py-4 border-t border-b grid grid-cols-[4fr_1fr_1fr] items-center gap-4'>
                  <div className='flex items-start gap-6'>
                    <img
                      className='w-16 sm:w-20'
                      src={Array.isArray(productInfo.image) ? productInfo.image[0] : productInfo.image}
                      alt={productInfo.name}
                    />
                    <div>
                      <p className='text-sm sm:text-lg font-medium'>{productInfo.name}</p>
                      <div className='flex items-center gap-5 mt-2'>
                        <p>{currency} {productInfo.price}</p>
                        <p className='border px-3 py-1 bg-slate-50'>{item.size}</p>
                      </div>
                    </div>
                  </div>
                  <input
                    type="number"
                    min={1}
                    defaultValue={item.quantity}
                    className='border px-2 py-1 w-16'
                    onChange={(e) =>
                      e.target.value > 0 &&
                      updateQuantity(item.id, Number(e.target.value))
                    }
                  />
                  <img
                    className='w-4 cursor-pointer'
                    src='https://cdn-icons-png.flaticon.com/128/484/484611.png'
                    onClick={() => updateQuantity(item.id, 0)}
                  />
                </div>
              )
            })}
          </div>

          {/* Cart Total and Checkout */}
          <div className='flex justify-end my-20'>
            <div className='w-full sm:w-[450px]'>
              <CartTotal />
              <div className='text-right'>
                <button
                  onClick={() => navigate('/place-order')}
                  className='bg-black text-white px-8 py-3 mt-8 hover:bg-gray-800 transition'
                >
                  PROCEED TO CHECKOUT
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default Cart