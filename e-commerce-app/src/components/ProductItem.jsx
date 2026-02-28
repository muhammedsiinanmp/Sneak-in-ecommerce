import React, { useContext } from 'react'
import { ShopContext } from '../context/ShopContext'
import { Link } from 'react-router-dom'

const ProductItem = ({ id, image, name, price }) => {

    const { currency } = useContext(ShopContext)



    return (
        <Link className='text-gray-700 cursor-pointer ' to={`/product/${id}`}>
            <div className='w-full h-64 flex justify-center items-center overflow-hidden border-[1px] '>
                <img
                    className='hover:scale-110 transition ease-in-out'
                    src={Array.isArray(image) ? image[0] : image || "/placeholder.png"}
                    alt={name || "Product"}
                />
            
            </div>
            <p className='pt-3 pb-1 text-sm'>{name}</p>
            <p className='text-sm font-medium'>{currency}{price}</p>
        </Link>
    )
}

export default ProductItem
