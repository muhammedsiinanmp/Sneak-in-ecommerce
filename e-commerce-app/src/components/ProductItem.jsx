import React, { useContext } from 'react'
import { ShopContext } from '../context/ShopContext'
import { AuthContext } from '../context/AuthContext'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'

const ProductItem = ({ id, image, name, price }) => {

    const { currency, isInWishlist, addToWishlist, removeFromWishlist, getWishlistItemId } = useContext(ShopContext)
    const { user } = useContext(AuthContext)

    const handleWishlistToggle = (e) => {
        e.preventDefault(); // Prevent navigating to product page
        if (!user) {
            toast.error("Please login to use wishlist!");
            return;
        }
        if (isInWishlist(id)) {
            const wishlistId = getWishlistItemId(id);
            if (wishlistId) removeFromWishlist(wishlistId);
        } else {
            addToWishlist(id);
        }
    };

    return (
        <div className="relative group">
            <Link className='text-gray-700 cursor-pointer' to={`/product/${id}`}>
                <div className='w-full h-64 flex justify-center items-center overflow-hidden border-[1px] bg-slate-50 relative'>
                    <img
                        className='hover:scale-110 transition ease-in-out object-contain h-full w-full p-2'
                        src={Array.isArray(image) ? image[0] : image || "/placeholder.png"}
                        alt={name || "Product"}
                    />

                    {/* Wishlist Heart Overlay */}
                    <button
                        onClick={handleWishlistToggle}
                        className="absolute top-2 right-2 bg-white/80 p-1.5 rounded-full shadow-sm hover:bg-white transition opacity-0 group-hover:opacity-100 z-10"
                    >
                        {isInWishlist(id) ? (
                            <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                        ) : (
                            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>
                        )}
                    </button>
                </div>
                <div className="px-1">
                    <p className='pt-3 pb-1 text-sm font-medium truncate'>{name}</p>
                    <p className='text-sm font-bold text-black'>{currency}{price}</p>
                </div>
            </Link>
        </div>
    )
}

export default ProductItem
