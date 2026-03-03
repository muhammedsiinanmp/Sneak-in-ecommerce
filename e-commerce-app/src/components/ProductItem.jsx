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
                            <span className="text-red-500 text-sm">❤️</span>
                        ) : (
                            <span className="text-gray-400 text-sm">🤍</span>
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
