import React, { useContext, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ShopContext } from '../context/ShopContext'
import RelatedProducts from '../components/RelatedProducts'
import { AuthContext } from '../context/AuthContext'
import { toast } from 'react-toastify'

const Product = () => {

  const { productId } = useParams()
  const { products, currency, addToCart } = useContext(ShopContext)
  const { user } = useContext(AuthContext)

  const [productData, setProductData] = useState(false)
  const [image, setImage] = useState("")
  const [size, setSize] = useState("")

  const fetchProductData = async () => {
    products.map((item) => {
      if (item.id === productId) {
        setProductData(item)
        setImage(item.image[0])
      }
      return null
    })
  }

  useEffect(() => {
    fetchProductData()
  }, [productId, products])

  return productData ? (
    <div className="border-t-2 pt-10">

      <div className="flex flex-col sm:flex-row gap-10">

        {/* LEFT IMAGES */}
        <div className="flex flex-col sm:flex-row gap-4 items-start">
          <div className="flex sm:flex-col gap-4 overflow-x-auto sm:overflow-y-auto">
            {productData.image.map((item, index) => (
              <img
                key={index}
                src={item}
                className="w-[140px] h-[140px] border cursor-pointer object-contain"
                onClick={() => setImage(item)}
              />
            ))}
          </div>

          <div className="max-w-[500px] w-full">
            <img src={image} className="w-full h-auto" />
          </div>
        </div>

        {/* DETAILS */}
        <div className="flex-1">
          <h1 className="text-2xl font-medium">{productData.name}</h1>

          <p className="mt-5 text-3xl font-medium">
            {currency}{productData.price}
          </p>

          <p className="mt-5 text-gray-500">{productData.description}</p>

          {/* SIZE SELECT */}
          <div className="my-8">
            <p>Select Size</p>
            <div className="flex gap-2 mt-2">
              {productData.sizes.map((item, index) => (
                <button
                  key={index}
                  onClick={() => setSize(item)}
                  className={`border py-2 px-4 ${item === size ? "bg-blue-200" : "bg-gray-100"}`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          {/* ADD TO CART */}
          <button
            onClick={() => {
              if (!user) {
                toast.error("Please login to add items to cart!");
                return;
              }

              if (!size) {
                toast.error("Please select a size!");
                return;
              }

              addToCart(productData.id, size); // This already handles success & error
            }}

            className="bg-black text-white px-8 py-3"
          >
            ADD TO CART
          </button>

          <hr className="mt-6" />

        </div>
      </div>

      {/* RELATED PRODUCTS */}
      <RelatedProducts category={productData.category} subcategory={productData.subcategory} />

    </div>
  ) : (
    <div>Loading...</div>
  )
}

export default Product
