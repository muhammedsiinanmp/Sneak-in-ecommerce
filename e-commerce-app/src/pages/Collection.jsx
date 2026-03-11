import React, { useContext, useEffect, useState } from 'react'
import { ShopContext } from '../context/ShopContext'
import Title from '../components/Title'
import ProductItem from '../components/ProductItem'

const PRODUCTS_PER_PAGE = 12;

const Collection = () => {

  const { products,search,showSearch} = useContext(ShopContext)

  const [showFilter, setShowFilter] = useState(true)

  const [filterProducts, setFilterProducts] = useState([])

  const [category, setCategory] = useState([])
  const [subCategegory, setSubCategory] = useState([])
  const[sortType,setSortType]=useState('relevant')
  const [currentPage, setCurrentPage] = useState(1)

  const toggleCategory = (e) => {
    if (category.includes(e.target.value)) {
      setCategory(prev => prev.filter(item => item !== e.target.value))
    } else {
      setCategory(prev => [...prev, e.target.value])
    }
  }

  const toggleSubCategory = (e) => {
    if (subCategegory.includes(e.target.value)) {
      setSubCategory(prev => prev.filter(item => item !== e.target.value))
    } else {
      setSubCategory(prev => [...prev, e.target.value])
    }
  }

  const applyFilter = () => {

    let productsCopy = products.slice()

    if (showSearch&&search) {
      productsCopy = productsCopy.filter(item=> item.name.toLowerCase().includes(search.toLowerCase()))
    }

    if (category.length > 0) {
      productsCopy = productsCopy.filter(item => category.includes(item.category))
    }

    if (subCategegory.length > 0) {
      productsCopy = productsCopy.filter(item =>
        subCategegory.includes(item.subcategory)
      )
    }

    setFilterProducts(productsCopy)
  }

  const sortProduct = () => {
    let fpCopy = filterProducts.slice();

    switch (sortType) {
      case 'low-high':
        setFilterProducts(fpCopy.sort((a, b) => (a.price - b.price)))
        break;
      case 'high-low':
        setFilterProducts(fpCopy.sort((a, b) => (b.price - a.price)))
        break;
      default:
        applyFilter();
        break;
    }
  }

  useEffect(() => {
    setFilterProducts(products)
  }, [products])

  useEffect(() => {
    applyFilter();
    setCurrentPage(1);
  }, [category, subCategegory,search,showSearch])

  useEffect(()=>{
    sortProduct();
    setCurrentPage(1);
  },[sortType])

  // Pagination logic
  const totalPages = Math.ceil(filterProducts.length / PRODUCTS_PER_PAGE);
  const startIdx = (currentPage - 1) * PRODUCTS_PER_PAGE;
  const paginatedProducts = filterProducts.slice(startIdx, startIdx + PRODUCTS_PER_PAGE);

  const goToPage = (page) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start < maxVisible - 1) {
      start = Math.max(1, end - maxVisible + 1);
    }
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  };


  return (
    <div className='flex flex-col sm:flex-row gap-1 sm:gap-10 pt-10 border-t'>

      {/* Filter Options */}
      <div className='min-w-60'>
        <p onClick={() => setShowFilter(!showFilter)} className='my-2 text-xl flex items-center cursor-pointer gap-2'>FILTERS
          <img className={`h-3 sm:hidden ${showFilter ? 'rotate-180' : ""}`} src="https://cdn-icons-png.flaticon.com/128/32/32195.png" alt="" />
        </p>
        {/* Category Filter */}
        <div className={`border border-gray-300 pl-5 py-3 mt-6 ${showFilter ? "" : 'hidden'} sm:block `}>
          <p className='mb-3 text-sm font-medium '>CATEGORIES</p>
          <div className='flex flex-col gap-2 text-sm font-light text-gray-700'>
            <p className='flex gap-2'>
              <input className='w-3' type="checkbox" value={'Men'} onChange={toggleCategory} /> Men
            </p>
            <p className='flex gap-2'>
              <input className='w-3' type="checkbox" value={'Women'} onChange={toggleCategory} /> Women
            </p>
            <p className='flex gap-2'>
              <input className='w-3' type="checkbox" value={'Kids'} onChange={toggleCategory} /> Kids
            </p>
          </div>
        </div>
        {/* SubCategegory Filter */}
        <div className={`border border-gray-300 pl-5 py-3 mt-6 ${showFilter ? " " : 'hidden'} sm:block `}>
          <p className='mb-3 text-sm font-medium '> Subcategories</p>
          <div className='flex flex-col gap-2 text-sm font-light text-gray-700'>
            <p className='flex gap-2'>
              <input className='w-3' type="checkbox" value={'Sneakers'} onChange={toggleSubCategory} /> Sneakers
            </p>
            <p className='flex gap-2'>
              <input className='w-3' type="checkbox" value={'Sandals'} onChange={toggleSubCategory} /> Sandals
            </p>
            <p className='flex gap-2'>
              <input className='w-3' type="checkbox" value={'Boots'} onChange={toggleSubCategory} /> Boots
            </p>
          </div>
        </div>
      </div>

      {/* Right Side */}

      <div className='flex-1'>

        <div className='flex justify-between text-base sm:text-2xl mb-4'>
          <Title text1={`ALL `} text2={`COLLECTIONS`} />
          {/* Product Sort */}

          <select onChange={(e)=>setSortType(e.target.value)} className='border-2 border-gray-300 text-sm px-2'>
            <option value="relevent">Sort by : Relevent</option>
            <option value="low-high">Sort by : Low-High</option>
            <option value="high-low">Sort by : High-Low</option>
          </select>
        </div>

        {/* Product count */}
        <p className="text-xs text-gray-400 mb-4">
          Showing {paginatedProducts.length} of {filterProducts.length} products
          {totalPages > 1 && <span> &middot; Page {currentPage} of {totalPages}</span>}
        </p>

        {/* Map Products */}
        <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 gap-y-6'>
          {
            paginatedProducts.map((item, index) => (
              <ProductItem key={index} name={item.name} id={item.id} price={item.price} image={item.image} />
            ))
          }
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-10 mb-6">
            {/* Previous */}
            <button
              disabled={currentPage === 1}
              onClick={() => goToPage(currentPage - 1)}
              className={`px-3 py-2 text-sm border transition-colors ${
                currentPage === 1
                  ? 'border-gray-100 text-gray-300 cursor-not-allowed'
                  : 'border-gray-300 text-gray-700 hover:bg-black hover:text-white hover:border-black'
              }`}
            >
              ← Prev
            </button>

            {/* First page + ellipsis */}
            {getPageNumbers()[0] > 1 && (
              <>
                <button onClick={() => goToPage(1)}
                  className="w-10 h-10 text-sm border border-gray-300 text-gray-700 hover:bg-black hover:text-white hover:border-black transition-colors">
                  1
                </button>
                {getPageNumbers()[0] > 2 && <span className="text-gray-400 px-1">…</span>}
              </>
            )}

            {/* Page numbers */}
            {getPageNumbers().map(page => (
              <button
                key={page}
                onClick={() => goToPage(page)}
                className={`w-10 h-10 text-sm border transition-colors ${
                  currentPage === page
                    ? 'bg-black text-white border-black'
                    : 'border-gray-300 text-gray-700 hover:bg-black hover:text-white hover:border-black'
                }`}
              >
                {page}
              </button>
            ))}

            {/* Last page + ellipsis */}
            {getPageNumbers()[getPageNumbers().length - 1] < totalPages && (
              <>
                {getPageNumbers()[getPageNumbers().length - 1] < totalPages - 1 && <span className="text-gray-400 px-1">…</span>}
                <button onClick={() => goToPage(totalPages)}
                  className="w-10 h-10 text-sm border border-gray-300 text-gray-700 hover:bg-black hover:text-white hover:border-black transition-colors">
                  {totalPages}
                </button>
              </>
            )}

            {/* Next */}
            <button
              disabled={currentPage === totalPages}
              onClick={() => goToPage(currentPage + 1)}
              className={`px-3 py-2 text-sm border transition-colors ${
                currentPage === totalPages
                  ? 'border-gray-100 text-gray-300 cursor-not-allowed'
                  : 'border-gray-300 text-gray-700 hover:bg-black hover:text-white hover:border-black'
              }`}
            >
              Next →
            </button>
          </div>
        )}
      </div>

    </div>
  )
}

export default Collection

