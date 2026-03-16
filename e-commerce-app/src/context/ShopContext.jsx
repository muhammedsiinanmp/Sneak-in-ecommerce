// src/context/ShopContext.jsx
import React, { createContext, useEffect, useState, useContext, useCallback } from "react";
import { AuthContext } from "./AuthContext";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";

export const ShopContext = createContext();

const API = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

export const ShopProvider = ({ children }) => {
  const navigate = useNavigate();
  const { user, getAccessToken } = useContext(AuthContext);

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cartItems, setCartItems] = useState([]);
  const [cartTotal, setCartTotal] = useState(0);
  const [cartCount, setCartCount] = useState(0);
  const [wishlistItems, setWishlistItems] = useState([]);
  const [showSearch, setShowSearch] = useState(false);
  const [search, setSearch] = useState("");

  const currency = "₹";

  // ── helper: authenticated fetch ────────────────────────
  const authFetch = useCallback(
    async (url, options = {}) => {
      const token = await getAccessToken();
      if (!token) return null;

      const res = await fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...options.headers,
        },
      });
      return res;
    },
    [getAccessToken]
  );

  // =====================================================
  // 1) LOAD PRODUCTS (fetch all pages)
  // =====================================================
  useEffect(() => {
    const loadProducts = async () => {
      setLoading(true);
      try {
        let allProducts = [];
        let url = `${API}/products/?page_size=100`;

        while (url) {
          const res = await fetch(url);
          const data = await res.json();

          if (data.results) {
            allProducts = [...allProducts, ...data.results];
            url = data.next;
          } else if (Array.isArray(data)) {
            allProducts = data;
            url = null;
          } else {
            url = null;
          }
        }

        // Normalise: ensure image is always an array for list compatibility
        const normalised = allProducts.map((p) => ({
          ...p,
          image: Array.isArray(p.image) ? p.image : p.image ? [p.image] : [],
        }));

        setProducts(normalised);
      } catch (err) {
        console.error("Failed to load products:", err);
      } finally {
        setLoading(false);
      }
    };
    loadProducts();
  }, []);

  // =====================================================
  // 2) LOAD CART ON LOGIN
  // =====================================================
  const loadCart = useCallback(async () => {
    if (!user) {
      setCartItems([]);
      setCartTotal(0);
      setCartCount(0);
      return;
    }

    try {
      const res = await authFetch(`${API}/cart/`);
      if (!res || !res.ok) {
        setCartItems([]);
        return;
      }
      const data = await res.json();
      setCartItems(data.items || []);
      setCartTotal(data.total || 0);
      setCartCount(data.item_count || 0);
    } catch (err) {
      console.error("Failed to load cart:", err);
      setCartItems([]);
    }
  }, [user, authFetch]);

  useEffect(() => {
    loadCart();
  }, [loadCart]);

  // =====================================================
  // 3) CART OPERATIONS
  // =====================================================
  const addToCart = async (productId, size) => {
    if (!user) {
      toast.error("Please login to add items to cart!");
      return;
    }

    const product = products.find((p) => String(p.id) === String(productId));
    if (!product) return toast.error("Product not found");

    if (product.in_stock === false) {
      return toast.error("This product is currently out of stock!");
    }

    try {
      const res = await authFetch(`${API}/cart/add/`, {
        method: "POST",
        body: JSON.stringify({
          product_id: Number(productId),
          size: Number(size),
          quantity: 1,
        }),
      });

      if (!res || !res.ok) {
        const err = await res?.json().catch(() => ({}));
        toast.error(err?.error || "Failed to add to cart");
        return;
      }

      const data = await res.json();
      setCartItems(data.items || []);
      setCartTotal(data.total || 0);
      setCartCount(data.item_count || 0);
      toast.success("Added to cart");
    } catch (err) {
      console.error("Add to cart error:", err);
      toast.error("Failed to add to cart");
    }
  };

  const updateQuantity = async (cartItemId, quantity) => {
    try {
      if (quantity <= 0) {
        // Remove via DELETE
        const res = await authFetch(`${API}/cart/item/${cartItemId}/remove/`, {
          method: "DELETE",
        });
        if (!res || !res.ok) return;
        const data = await res.json();
        setCartItems(data.items || []);
        setCartTotal(data.total || 0);
        setCartCount(data.item_count || 0);
      } else {
        const res = await authFetch(`${API}/cart/item/${cartItemId}/`, {
          method: "PATCH",
          body: JSON.stringify({ quantity }),
        });
        if (!res || !res.ok) return;
        const data = await res.json();
        setCartItems(data.items || []);
        setCartTotal(data.total || 0);
        setCartCount(data.item_count || 0);
      }
    } catch (err) {
      console.error("Update cart error:", err);
    }
  };

  const clearCart = async () => {
    try {
      const res = await authFetch(`${API}/cart/clear/`, {
        method: "DELETE",
      });
      if (res && res.ok) {
        const data = await res.json();
        setCartItems(data.items || []);
        setCartTotal(0);
        setCartCount(0);
      }
    } catch (err) {
      console.error("Clear cart error:", err);
    }
  };

  // =====================================================
  // 4) WISHLIST OPERATIONS
  // =====================================================
  const loadWishlist = useCallback(async () => {
    if (!user) {
      setWishlistItems([]);
      return;
    }
    try {
      const res = await authFetch(`${API}/wishlist/`);
      if (!res || !res.ok) {
        setWishlistItems([]);
        return;
      }
      const data = await res.json();
      // Handle paginated or plain array response
      setWishlistItems(data.results || data || []);
    } catch (err) {
      console.error("Failed to load wishlist:", err);
      setWishlistItems([]);
    }
  }, [user, authFetch]);

  useEffect(() => {
    loadWishlist();
  }, [loadWishlist]);

  const addToWishlist = async (productId) => {
    if (!user) {
      toast.error("Please login to add to wishlist!");
      return;
    }

    try {
      const res = await authFetch(`${API}/wishlist/`, {
        method: "POST",
        body: JSON.stringify({ product: Number(productId) }),
      });

      if (!res) return;

      if (res.status === 400) {
        toast.info("Already in wishlist");
        return;
      }

      if (!res.ok) {
        toast.error("Failed to add to wishlist");
        return;
      }

      await loadWishlist();
      toast.success("Added to wishlist");
    } catch (err) {
      console.error("Add to wishlist error:", err);
      toast.error("Failed to add to wishlist");
    }
  };

  const removeFromWishlist = async (wishlistItemId) => {
    try {
      const res = await authFetch(`${API}/wishlist/${wishlistItemId}/`, {
        method: "DELETE",
      });

      if (res && (res.ok || res.status === 204)) {
        await loadWishlist();
        toast.success("Removed from wishlist");
      }
    } catch (err) {
      console.error("Remove from wishlist error:", err);
    }
  };

  const isInWishlist = (productId) => {
    return wishlistItems.some(
      (item) => String(item.product) === String(productId)
    );
  };

  const getWishlistItemId = (productId) => {
    const item = wishlistItems.find(
      (item) => String(item.product) === String(productId)
    );
    return item?.id;
  };

  // =====================================================
  // 5) COMPUTED VALUES
  // =====================================================
  const getCartCount = () => cartCount;
  const getCartAmount = () => cartTotal;

  // =====================================================
  // PROVIDER VALUE
  // =====================================================
  return (
    <ShopContext.Provider
      value={{
        products,
        loading,
        currency,
        cartItems,
        setCartItems,
        showSearch,
        setShowSearch,
        addToCart,
        updateQuantity,
        clearCart,
        getCartCount,
        getCartAmount,
        navigate,
        search,
        setSearch,
        loadCart,
        // wishlist
        wishlistItems,
        addToWishlist,
        removeFromWishlist,
        isInWishlist,
        getWishlistItemId,
        loadWishlist,
        // auth fetch helper
        authFetch,
      }}
    >
      {children}
    </ShopContext.Provider>
  );
};

export default ShopProvider;
