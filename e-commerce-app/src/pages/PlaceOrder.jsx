import React, { useContext, useState } from 'react'
import Title from '../components/Title'
import CartTotal from '../components/CartTotal'
import { ShopContext } from '../context/ShopContext'
import { AuthContext } from "../context/AuthContext"
import { toast } from "react-toastify"

const PlaceOrder = () => {

  const [method, setMethod] = useState("cod");

  const { cartItems, products, navigate, setCartItems } = useContext(ShopContext);
  const { user } = useContext(AuthContext);

  const placeOrder = async () => {

    if (!user) {
      toast.error("Please login to place order!");
      return;
    }

    // Build order items
    const orderItems = [];

    for (const productId in cartItems) {
      for (const size in cartItems[productId]) {
        const quantity = cartItems[productId][size];
        const product = products.find(p => p.id === productId);

        if (product) {
          orderItems.push({
            productId,
            size,
            quantity,
            price: product.price,
            name: product.name,
            image: product.image[0]
          });
        }
      }
    }

    if (orderItems.length === 0) {
      toast.error("Your cart is empty");
      return;
    }

    const newOrder = {
      userId: user.id,
      items: orderItems,
      paymentMethod: method,
      date: new Date().toISOString()
    };

    // Save order to JSON server
    await fetch("http://localhost:3001/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newOrder)
    });

    // Clear cart in backend + UI
    setCartItems({});
    toast.success("Order placed successfully!");

    navigate("/orders");
  };

  return (
    <div className='flex flex-col sm:flex-row justify-between gap-4 pt-5 sm:pt-14 min-h-[80vh] border-t'>
      
      {/* LEFT */}
      <div className='flex flex-col gap-4 w-full sm:max-w-[480px]'>
        <div className='text-xl sm:text-2xl my-3'>
          <Title text1="DELIVERY " text2="INFORMATION" />
        </div>

        {/* Inputs */}
        <div className='flex gap-3 '>
          <input className='border border-gray-300 rounded py-1.5 px-3.5 w-full' placeholder='First name' />
          <input className='border border-gray-300 rounded py-1.5 px-3.5 w-full' placeholder='Last name' />
        </div>
        <input className='border border-gray-300 rounded py-1.5 px-3.5 w-full' placeholder='Email address' />
        <input className='border border-gray-300 rounded py-1.5 px-3.5 w-full' placeholder='Street' />
        <div className='flex gap-3 '>
          <input className='border border-gray-300 rounded py-1.5 px-3.5 w-full' placeholder='City' />
          <input className='border border-gray-300 rounded py-1.5 px-3.5 w-full' placeholder='State' />
        </div>
        <div className='flex gap-3 '>
          <input className='border border-gray-300 rounded py-1.5 px-3.5 w-full' placeholder='Zip code' />
          <input className='border border-gray-300 rounded py-1.5 px-3.5 w-full' placeholder='Country' />
        </div>
        <input className='border border-gray-300 rounded py-1.5 px-3.5 w-full' placeholder='Phone' />
      </div>

      {/* RIGHT */}
      <div className='mt-8'>
        <div className='mt-8 min-w-80'>
          <CartTotal />
        </div>

        <div className='mt-12'>
          <Title text1="PAYMENT " text2="METHOD" />

          <div className='flex gap-3 flex-col lg:flex-row'>
            <div onClick={() => setMethod('stripe')} className='flex items-center gap-3 border p-2 px-3 cursor-pointer'>
              <p className={`min-w-3.5 h-3.5 border rounded-full ${method === 'stripe' ? 'bg-green-400' : ''}`}></p>
              <img className='h-5 mx-4' src="https://vikwp.com/images/plugins/stripe.png" />
            </div>

            <div onClick={() => setMethod('razorpay')} className='flex items-center gap-3 border p-2 px-3 cursor-pointer'>
              <p className={`min-w-3.5 h-3.5 border rounded-full ${method === 'razorpay' ? 'bg-green-400' : ''}`}></p>
              <img className='h-5 mx-4' src="https://d6xcmfyh68wv8.cloudfront.net/newsroom-content/uploads/2024/05/Razorpay-Logo.jpg" />
            </div>

            <div onClick={() => setMethod('cod')} className='flex items-center gap-3 border p-2 px-3 cursor-pointer'>
              <p className={`min-w-3.5 h-3.5 border rounded-full ${method === 'cod' ? 'bg-green-400' : ''}`}></p>
              <p className='text-gray-500 text-sm font-medium mx-4'>CASH ON DELIVERY</p>
            </div>
          </div>

          <div className='w-full text-end mt-8'>
            <button
              onClick={placeOrder}
              className='bg-black text-white px-16 py-3 text-sm'
            >
              PLACE ORDER
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}

export default PlaceOrder;
