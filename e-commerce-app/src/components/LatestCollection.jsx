import React, { useContext, useEffect, useState } from 'react'
import { ShopContext } from '../context/ShopContext'
import Title from './Title'
import ProductItem from './ProductItem'
import Loading from './Loading'

const LatestCollection = () => {

    const { products, loading } = useContext(ShopContext)

    const [latestProducts, setLatestProducts] = useState([])

    useEffect(() => {
        if (products.length > 0) {
            setLatestProducts(products.slice(0, 10)); // or however many you want
        }
    }, [products]);


    return (
        <div className='my-10'>
            <div className='text-center py-8 text-3xl'>
                <Title text1={`LATEST `} text2={`COLLECTIONS`} />
                <p className='w-3/4 m-auto text-xs sm:text-sm md:text-base text-gray-600'>
                    Discover the newest arrivals crafted to elevate every step.
                    Our latest collection blends cutting-edge design with unmatched comfort, bringing fresh styles for every occasion.
                    Explore the trends of today and be the first to wear tomorrow’s favorites.
                </p>
            </div>

            {/* Rendering Products */}
            {
                loading ? (
                    <Loading />
                ) : (
                    <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 gap-y-6'>
                        {
                            latestProducts.map((item, index) => (
                                <ProductItem
                                    key={item.id}
                                    id={item.id}
                                    image={item.image}
                                    name={item.name}
                                    price={item.price}
                                />
                            ))
                        }
                    </div>
                )
            }

        </div>
    )
}

export default LatestCollection
