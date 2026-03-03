import React, { useContext } from 'react'
import { ShopContext } from '../context/ShopContext'
import Title from '../components/Title'
import ProductItem from '../components/ProductItem'

const Wishlist = () => {
    const { wishlistItems, removeFromWishlist, currency, navigate } = useContext(ShopContext);

    return (
        <div className='border-t pt-14'>
            <div className='text-2xl mb-8'>
                <Title text1={'MY '} text2={'WISHLIST'} />
            </div>

            {wishlistItems.length === 0 ? (
                <div className='flex flex-col items-center justify-center py-20'>
                    <img
                        src='https://cdn-icons-png.flaticon.com/128/10444/10444641.png'
                        alt='Empty Wishlist'
                        className='w-32 h-32 mb-6 opacity-30'
                    />
                    <h2 className='text-2xl font-medium text-gray-700 mb-2'>Your Wishlist is Empty</h2>
                    <p className='text-gray-500 mb-6'>Save your favorite items here to find them easily later.</p>
                    <button
                        onClick={() => navigate('/collection')}
                        className='bg-black text-white px-8 py-3 hover:bg-gray-800 transition'
                    >
                        GO TO COLLECTION
                    </button>
                </div>
            ) : (
                <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 gap-y-6'>
                    {wishlistItems.map((item) => {
                        const product = item.product_detail;
                        if (!product) return null;

                        return (
                            <div key={item.id} className="relative group">
                                <ProductItem
                                    id={product.id}
                                    name={product.name}
                                    price={product.price}
                                    image={product.image}
                                />
                                <button
                                    onClick={(e) => {
                                        e.preventDefault();
                                        removeFromWishlist(item.id);
                                    }}
                                    className="absolute top-2 right-2 bg-white p-1.5 rounded-full shadow-md hover:bg-red-50 transition opacity-0 group-hover:opacity-100"
                                    title="Remove from Wishlist"
                                >
                                    <img
                                        src="https://cdn-icons-png.flaticon.com/128/484/484611.png"
                                        className="w-4 h-4"
                                        alt="Remove"
                                    />
                                </button>
                                <div className="mt-2 text-center">
                                    <button
                                        onClick={() => navigate(`/product/${product.id}`)}
                                        className="text-xs bg-gray-100 hover:bg-gray-200 py-1 px-4 rounded"
                                    >
                                        View Product
                                    </button>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

export default Wishlist
