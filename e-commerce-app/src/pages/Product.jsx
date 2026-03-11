import React, { useContext, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ShopContext } from '../context/ShopContext'
import { AuthContext } from '../context/AuthContext'
import RelatedProducts from '../components/RelatedProducts'
import { toast } from 'react-toastify'

const API = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

const Product = () => {

  const { productId } = useParams()
  const { currency, addToCart, isInWishlist, addToWishlist, removeFromWishlist, getWishlistItemId } = useContext(ShopContext)
  const { user } = useContext(AuthContext)

  const [productData, setProductData] = useState(null)
  const [image, setImage] = useState("")
  const [size, setSize] = useState("")

  // Fetch product detail from Django API
  useEffect(() => {
    const fetchProduct = async () => {
      try {
        const res = await fetch(`${API}/products/${productId}/`)
        if (!res.ok) return
        const data = await res.json()
        setProductData(data)
        // Set first image
        if (data.images && data.images.length > 0) {
          setImage(data.images[0].image_url)
        }
      } catch (err) {
        console.error("Failed to fetch product:", err)
      }
    }
    fetchProduct()
  }, [productId])

  // Wishlist toggle
  const handleWishlistToggle = () => {
    if (!user) {
      toast.error("Please login to use wishlist!")
      return
    }
    if (isInWishlist(productData.id)) {
      const wishlistId = getWishlistItemId(productData.id)
      if (wishlistId) removeFromWishlist(wishlistId)
    } else {
      addToWishlist(productData.id)
    }
  }

  return productData ? (
    <div className="border-t-2 pt-10">

      <div className="flex flex-col sm:flex-row gap-10">

        {/* LEFT IMAGES */}
        <div className="flex flex-col sm:flex-row gap-4 items-start">
          <div className="flex sm:flex-col gap-4 overflow-x-auto sm:overflow-y-auto">
            {productData.images && productData.images.map((item, index) => (
              <img
                key={index}
                src={item.image_url}
                className="w-[140px] h-[140px] border cursor-pointer object-contain"
                onClick={() => setImage(item.image_url)}
              />
            ))}
          </div>

          <div className="max-w-[500px] w-full">
            <img src={image} className="w-full h-auto" />
          </div>
        </div>

        {/* DETAILS */}
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-medium">{productData.name}</h1>
            {/* Wishlist Heart */}
            <button
              onClick={handleWishlistToggle}
              className="text-2xl transition-colors duration-200"
              title={isInWishlist(productData.id) ? "Remove from Wishlist" : "Add to Wishlist"}
            >
              {isInWishlist(productData.id) ? (
                <svg className="w-7 h-7 text-red-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
              ) : (
                <svg className="w-7 h-7 text-gray-400 hover:text-red-400 transition-colors" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>
              )}
            </button>
          </div>

          {productData.brand && (
            <p className="text-sm text-gray-500 mt-1">
              {typeof productData.brand === 'object' ? productData.brand.name : productData.brand}
            </p>
          )}

          <div className="flex items-center gap-3 mt-5">
            <p className="text-3xl font-medium">
              {currency}{productData.price}
            </p>
            {productData.mrp && Number(productData.mrp) > Number(productData.price) && (
              <p className="text-xl text-gray-400 line-through">
                {currency}{productData.mrp}
              </p>
            )}
          </div>

          <p className="mt-5 text-gray-500">{productData.description}</p>

          {/* STOCK STATUS */}
          {!productData.in_stock && (
            <p className="mt-3 text-red-500 font-medium">Out of Stock</p>
          )}

          {/* SIZE SELECT */}
          <div className="my-8">
            <p>Select Size</p>
            <div className="flex gap-2 mt-2 flex-wrap">
              {productData.sizes && productData.sizes.map((item, index) => (
                <button
                  key={index}
                  onClick={() => setSize(item.size_value)}
                  className={`border py-2 px-4 ${item.size_value === size ? "bg-blue-200" : "bg-gray-100"} ${item.stock <= 0 ? "opacity-40 cursor-not-allowed" : ""}`}
                  disabled={item.stock <= 0}
                >
                  {item.size_value}
                  {item.stock <= 0 && <span className="text-xs ml-1">(Out)</span>}
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

              addToCart(productData.id, size);
            }}

            className={`bg-black text-white px-8 py-3 ${!productData.in_stock ? 'opacity-50 cursor-not-allowed' : ''}`}
            disabled={!productData.in_stock}
          >
            {productData.in_stock ? 'ADD TO CART' : 'OUT OF STOCK'}
          </button>

          <hr className="mt-6" />

        </div>
      </div>

      {/* RELATED PRODUCTS */}
      <RelatedProducts
        category={typeof productData.category === 'object' ? productData.category.name : productData.category}
        subcategory={typeof productData.subcategory === 'object' ? productData.subcategory.name : productData.subcategory}
      />

    </div>
  ) : (
    <div className="text-center py-20 text-gray-500">Loading...</div>
  )
}

export default Product
