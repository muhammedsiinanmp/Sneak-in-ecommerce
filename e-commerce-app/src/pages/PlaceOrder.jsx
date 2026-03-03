import React, { useContext, useState } from 'react'
import Title from '../components/Title'
import CartTotal from '../components/CartTotal'
import { ShopContext } from '../context/ShopContext'
import { AuthContext } from "../context/AuthContext"
import { toast } from "react-toastify"

const PlaceOrder = () => {

  const [method, setMethod] = useState("cod");

  const { cartItems, navigate, setCartItems, authFetch } = useContext(ShopContext);
  const { user } = useContext(AuthContext);

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    street: '',
    city: '',
    state: '',
    zipcode: '',
    country: '',
    phone: ''
  });

  const onChangeHandler = (e) => {
    const { name, value } = e.target;
    setFormData(data => ({ ...data, [name]: value }));
  };

  const placeOrder = async (e) => {
    if (e) e.preventDefault();

    if (!user) {
      toast.error("Please login to place order!");
      return;
    }

    if (cartItems.length === 0) {
      toast.error("Your cart is empty");
      return;
    }

    // Build shipping address string
    const address = `${formData.firstName} ${formData.lastName}, ${formData.street}, ${formData.city}, ${formData.state}, ${formData.zipcode}, ${formData.country}. Phone: ${formData.phone}`;

    try {
      const res = await authFetch(`${import.meta.env.VITE_API_URL || "http://localhost:8000/api"}/orders/place/`, {
        method: "POST",
        body: JSON.stringify({
          payment_method: method,
          shipping_address: address
        })
      });

      if (!res) return;

      if (!res.ok) {
        const errorData = await res.json();
        toast.error(errorData.error || "Failed to place order");
        return;
      }

      toast.success("Order placed successfully!");
      setCartItems([]);
      navigate("/orders");
    } catch (err) {
      console.error("Order error:", err);
      toast.error("Failed to place order");
    }
  };

  return (
    <div className='flex flex-col sm:flex-row justify-between gap-4 pt-5 sm:pt-14 min-h-[80vh] border-t'>

      {/* LEFT */}
      <form onSubmit={placeOrder} className='flex flex-col gap-4 w-full sm:max-w-[480px]'>
        <div className='text-xl sm:text-2xl my-3'>
          <Title text1="DELIVERY " text2="INFORMATION" />
        </div>

        {/* Inputs */}
        <div className='flex gap-3 '>
          <input required name='firstName' onChange={onChangeHandler} value={formData.firstName} className='border border-gray-300 rounded py-1.5 px-3.5 w-full' placeholder='First name' />
          <input required name='lastName' onChange={onChangeHandler} value={formData.lastName} className='border border-gray-300 rounded py-1.5 px-3.5 w-full' placeholder='Last name' />
        </div>
        <input required name='email' onChange={onChangeHandler} value={formData.email} className='border border-gray-300 rounded py-1.5 px-3.5 w-full' placeholder='Email address' />
        <input required name='street' onChange={onChangeHandler} value={formData.street} className='border border-gray-300 rounded py-1.5 px-3.5 w-full' placeholder='Street' />
        <div className='flex gap-3 '>
          <input required name='city' onChange={onChangeHandler} value={formData.city} className='border border-gray-300 rounded py-1.5 px-3.5 w-full' placeholder='City' />
          <input required name='state' onChange={onChangeHandler} value={formData.state} className='border border-gray-300 rounded py-1.5 px-3.5 w-full' placeholder='State' />
        </div>
        <div className='flex gap-3 '>
          <input required name='zipcode' onChange={onChangeHandler} value={formData.zipcode} className='border border-gray-300 rounded py-1.5 px-3.5 w-full' placeholder='Zip code' />
          <input required name='country' onChange={onChangeHandler} value={formData.country} className='border border-gray-300 rounded py-1.5 px-3.5 w-full' placeholder='Country' />
        </div>
        <input required name='phone' onChange={onChangeHandler} value={formData.phone} className='border border-gray-300 rounded py-1.5 px-3.5 w-full' placeholder='Phone' />
      </form>

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
