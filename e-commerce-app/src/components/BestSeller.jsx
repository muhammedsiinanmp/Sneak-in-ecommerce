import React, { useContext, useMemo } from 'react'
import { ShopContext } from '../context/contexts'
import Title from './Title'
import ProductItem from './ProductItem'
import Loading from './Loading'

const BestSeller = () => {

    const { products, loading } = useContext(ShopContext)
    const bestSeller = useMemo(
        () => products.filter((item) => (item.bestseller)).slice(0, 10),
        [products]
    )

    return (
        <div className='my-10'>
            <div className='text-center text-3xl py-8'>
                <Title text1={'BEST '} text2={'SELLERS'} />
                <p className='w-3/4 m-auto text-xs sm:text-sm md:text-base text-gray-600'>
                    Here are clean, premium-sounding three-line bestseller paragraphs you can use on your footwear website
                </p>
            </div>

            {
                loading ? (
                    <Loading />
                ) : (
                    <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 gap-y-6'>
                        {
                            bestSeller.map((item) => (
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

export default BestSeller
