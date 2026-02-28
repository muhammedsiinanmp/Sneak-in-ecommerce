// src/context/ShopContext.jsx
import React, { createContext, useEffect, useState, useContext } from "react";
import { AuthContext } from "./AuthContext";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";

export const ShopContext = createContext();

export const ShopProvider = ({ children }) => {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);

  const [products, setProducts] = useState([]);
  const [cartItems, setCartItems] = useState({});
  const [showSearch, setShowSearch] = useState(false);
  const [search, setSearch] = useState("");

  const currency = "₹";

  // -------------------------------------
  // 1) LOAD PRODUCTS
  // -------------------------------------
  useEffect(() => {
    const loadProducts = async () => {
      try {
        const res = await fetch("http://localhost:3001/products");
        const data = await res.json();
        setProducts(data);
      } catch (err) {
        console.error("Failed to load products:", err);
      }
    };
    loadProducts();
  }, []);

  // ------------------------------------------------------
  // 2) LOAD USER CART ON LOGIN
  // ------------------------------------------------------
  useEffect(() => {
    const loadUserCart = async () => {
      if (!user) {
        setCartItems({});
        return;
      }

      try {
        const res = await fetch(
          `http://localhost:3001/carts?userId=${user.id}`
        );
        const data = await res.json();

        // Find correct cart ONLY for this user
        const validCart = data.find((c) => c.userId === user.id);

        if (validCart) setCartItems(validCart.items || {});
        else setCartItems({});
      } catch (err) {
        console.error("Failed to load cart:", err);
        setCartItems({});
      }
    };

    loadUserCart();
  }, [user]);

  // ------------------------------------------------------
  // 3) SAVE CART TO SERVER (NEVER FOR LOGGED OUT USERS)
  // ------------------------------------------------------
  const saveCartToServer = async (updatedCart) => {
    if (!user) return; // prevent null user carts

    try {
      const res = await fetch(
        `http://localhost:3001/carts?userId=${user.id}`
      );
      const data = await res.json();

      if (data.length > 0) {
        // Update existing cart
        const cartId = data[0].id;

        await fetch(`http://localhost:3001/carts/${cartId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: updatedCart }),
        });
      } else {
        // Create new cart
        await fetch(`http://localhost:3001/carts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user.id,
            items: updatedCart,
          }),
        });
      }
    } catch (err) {
      console.error("Failed to save cart:", err);
    }
  };

  // ------------------------------------------------------
  // 4) ADD TO CART (STOCK CHECK + TOAST)
  // ------------------------------------------------------
  const addToCart = (productId, size) => {
    const product = products.find(
      (p) => String(p.id) === String(productId)
    );

    if (!product) return toast.error("Product not found");

    // Stock check
    if (
      product.inStock === false ||
      (typeof product.stock === "number" && product.stock <= 0)
    ) {
      return toast.error("This product is currently out of stock!");
    }

    const updated = { ...cartItems };

    if (!updated[productId]) updated[productId] = {};
    if (!updated[productId][size]) updated[productId][size] = 1;
    else updated[productId][size] += 1;

    setCartItems(updated);
    saveCartToServer(updated);

    toast.success("Added to cart");
  };

  // ------------------------------------------------------
  // 5) UPDATE QUANTITY / REMOVE ITEM
  // ------------------------------------------------------
  const updateQuantity = (productId, size, quantity) => {
    const updated = { ...cartItems };
    if (!updated[productId]) return;

    if (quantity <= 0) {
      delete updated[productId][size];
      if (Object.keys(updated[productId]).length === 0) {
        delete updated[productId];
      }
    } else {
      updated[productId][size] = quantity;
    }

    setCartItems(updated);
    saveCartToServer(updated);
  };

  // ------------------------------------------------------
  // 6) GET TOTAL ITEMS COUNT
  // ------------------------------------------------------
  const getCartCount = () => {
    let count = 0;
    for (const productId in cartItems) {
      for (const size in cartItems[productId]) {
        count += cartItems[productId][size];
      }
    }
    return count;
  };

  // ------------------------------------------------------
  // 7) GET TOTAL CART AMOUNT
  // ------------------------------------------------------
  const getCartAmount = () => {
    if (!products.length || !Object.keys(cartItems).length) return 0;

    let total = 0;

    for (const productId in cartItems) {
      for (const size in cartItems[productId]) {
        const qty = cartItems[productId][size];
        const product = products.find(
          (p) => String(p.id) === String(productId)
        );
        if (product) total += product.price * qty;
      }
    }

    return total;
  };

  // ------------------------------------------------------
  // PROVIDER VALUE
  // ------------------------------------------------------
  return (
    <ShopContext.Provider
      value={{
        products,
        currency,
        cartItems,
        setCartItems,
        showSearch,
        setShowSearch,
        addToCart,
        updateQuantity,
        getCartCount,
        getCartAmount,
        navigate,
        search,
        setSearch,
      }}
    >
      {children}
    </ShopContext.Provider>
  );
};

export default ShopProvider;
