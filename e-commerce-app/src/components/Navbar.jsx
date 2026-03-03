import React, { useContext, useState } from 'react'
import { NavLink, Link } from 'react-router-dom'
import { ShopContext } from '../context/ShopContext'
import { AuthContext } from '../context/AuthContext'

const Navbar = () => {

    const [visible, setVisible] = useState(false)

    const { setShowSearch, getCartCount, wishlistItems } = useContext(ShopContext)
    const { user, logout, isAdmin } = useContext(AuthContext)

    return (
        <div className='flex items-center justify-between py-5 font-medium'>

            <Link to="/" >
                <img src="/Sneak_logo.png" className='w-40 rounded' />
            </Link>

            {/* Desktop Menu */}
            <ul className='hidden sm:flex gap-5 text-sm text-gray-700'>
                <NavLink to='/' className='flex flex-col items-center gap-1'>
                    <p>HOME</p>
                    <hr className='w-2/4 border-none h-[1.5px] bg-gray-700 hidden' />
                </NavLink>

                <NavLink to='/collection' className='flex flex-col items-center gap-1'>
                    <p>COLLECTION</p>
                    <hr className='w-2/4 border-none h-[1.5px] bg-gray-700 hidden' />
                </NavLink>

                <NavLink to='/about' className='flex flex-col items-center gap-1'>
                    <p>ABOUT</p>
                    <hr className='w-2/4 border-none h-[1.5px] bg-gray-700 hidden' />
                </NavLink>

                <NavLink to='/contact' className='flex flex-col items-center gap-1'>
                    <p>CONTACT</p>
                    <hr className='w-2/4 border-none h-[1.5px] bg-gray-700 hidden' />
                </NavLink>

                {/* Admin Panel Link - Only visible for admins */}
                {isAdmin && (
                    <NavLink to='/admin' className='flex flex-col items-center gap-1'>
                        <p className='text-red-600 font-semibold'>ADMIN PANEL</p>
                        <hr className='w-2/4 border-none h-[1.5px] bg-red-600 hidden' />
                    </NavLink>
                )}
            </ul>

            <div className='flex items-center gap-6'>

                {/* Search */}
                <img
                    onClick={() => setShowSearch(true)}
                    src="https://cdn-icons-png.flaticon.com/128/3031/3031293.png"
                    className='w-5 cursor-pointer'
                />

                {/* USER DROPDOWN */}
                <div className='group relative'>
                    <img
                        src="https://cdn-icons-png.flaticon.com/128/1144/1144760.png"
                        className='w-5 cursor-pointer'
                    />

                    <div className='group-hover:block hidden absolute dropdown-menu right-0 pt-4'>
                        <div className='flex flex-col gap-2 w-36 py-5 px-5 bg-slate-100 text-gray-500 rounded'>

                            {/* NOT LOGGED IN MENU */}
                            {!user && (
                                <>
                                    <Link
                                        to="/login"
                                        className='cursor-pointer hover:text-black'
                                    >
                                        Login
                                    </Link>

                                    <Link
                                        to="/login"
                                        className='cursor-pointer hover:text-black'
                                    >
                                        Create Account
                                    </Link>
                                </>
                            )}

                            {/* LOGGED IN MENU */}
                            {user && (
                                <>
                                    <Link
                                        to="/profile"
                                        className='cursor-pointer font-medium text-black hover:underline'
                                    >
                                        Hai,{user.name}
                                    </Link>

                                    {/* Admin Panel in Dropdown (Mobile friendly) */}
                                    {isAdmin && (
                                        <Link
                                            to="/admin"
                                            className='cursor-pointer hover:text-black text-red-600 font-semibold'
                                        >
                                            Admin Panel
                                        </Link>
                                    )}

                                    <Link
                                        to="/wishlist"
                                        className='cursor-pointer hover:text-black'
                                    >
                                        Wishlist
                                    </Link>

                                    <Link
                                        to="/orders"
                                        className='cursor-pointer hover:text-black'
                                    >
                                        Orders
                                    </Link>

                                    <p
                                        onClick={logout}
                                        className='cursor-pointer hover:text-black'
                                    >
                                        Logout
                                    </p>
                                </>
                            )}


                        </div>
                    </div>
                </div>

                {/* Wishlist */}
                <Link to="/wishlist" className="relative hidden sm:block">
                    <img
                        src="https://cdn-icons-png.flaticon.com/128/1077/1077035.png"
                        className='w-5 cursor-pointer'
                        alt="Wishlist"
                    />
                    <p className="absolute top-[-5px] right-[-8px] min-w-4 text-center leading-4 bg-red-500 text-white rounded-full text-[8px] px-1">
                        {wishlistItems.length}
                    </p>
                </Link>

                {/* Cart */}
                <Link to="/cart" className="relative">
                    <img
                        src="https://cdn-icons-png.flaticon.com/128/3144/3144456.png"
                        className='w-6 min-w-6'
                    />
                    <p className="absolute top-[-4px] right-[-4px] w-4 text-center leading-4 bg-black text-white rounded-full text-[8px]">
                        {getCartCount()}
                    </p>
                </Link>

                {/* Mobile Menu Button */}
                <img
                    onClick={() => setVisible(true)}
                    src="https://cdn-icons-png.flaticon.com/128/2976/2976215.png"
                    className='w-6 cursor-pointer sm:hidden'
                />
            </div>

            {/* Mobile Sidebar */}
            <div className={`absolute top-0 right-0 bottom-0 overflow-hidden bg-white transition-all ${visible ? 'w-full' : 'w-0'}`}>
                <div className='flex flex-col text-gray-600'>
                    <div
                        onClick={() => setVisible(false)}
                        className='flex items-center gap-4 p-3 cursor-pointer'
                    >
                        <img
                            src="https://cdn-icons-png.flaticon.com/128/32/32195.png"
                            className='h-4 rotate-90'
                        />
                        <p>Back</p>
                    </div>
                    <NavLink onClick={() => setVisible(false)} className="py-2 pl-6 border" to="/" >Home</NavLink>
                    <NavLink onClick={() => setVisible(false)} className="py-2 pl-6 border" to="/collection" >Collection</NavLink>
                    <NavLink onClick={() => setVisible(false)} className="py-2 pl-6 border" to="/about" >About</NavLink>
                    <NavLink onClick={() => setVisible(false)} className="py-2 pl-6 border" to="/contact" >Contact</NavLink>

                    {/* Admin Panel in Mobile Menu */}
                    {isAdmin && (
                        <NavLink
                            onClick={() => setVisible(false)}
                            className="py-2 pl-6 border bg-red-50 text-red-600 font-semibold"
                            to="/admin"
                        >
                            Admin Panel
                        </NavLink>
                    )}
                </div>
            </div>

        </div>
    )
}

export default Navbar