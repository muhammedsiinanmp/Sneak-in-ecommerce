import React, { useContext, useEffect, useState } from 'react'
import { ShopContext } from '../context/ShopContext'
import { AuthContext } from '../context/AuthContext'
import Title from '../components/Title'
import { toast } from 'react-toastify'

const Orders = () => {
  const { currency } = useContext(ShopContext);
  const { user } = useContext(AuthContext);
  const [orders, setOrders] = useState([]);

  const fetchOrders = async () => {
    if (!user) return;

    try {
      const res = await fetch(`http://localhost:3001/orders`);
      const data = await res.json();
      
      const filtered = data.filter(order => order.userId === user.id);

      setOrders(filtered);
    } catch (err) {
      console.error("Failed to fetch orders:", err);
    }
  };


  useEffect(() => {
    fetchOrders();

    // Listen for global updates (admin or other actions)
    const onOrdersUpdated = () => fetchOrders();
    window.addEventListener("ordersUpdated", onOrdersUpdated);
    return () => window.removeEventListener("ordersUpdated", onOrdersUpdated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // cancel only one item inside an order
  const cancelItem = async (order, itemIndex) => {
    const updatedItems = JSON.parse(JSON.stringify(order.items)); // deep copy
    if (!updatedItems[itemIndex]) return;

    // mark the item cancelled
    updatedItems[itemIndex] = {
      ...updatedItems[itemIndex],
      cancelled: true
    };

    // if all items cancelled, set order status to cancelled
    const allCancelled = updatedItems.every(i => i.cancelled);

    try {
      const res = await fetch(`http://localhost:3001/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: updatedItems,
          status: allCancelled ? "cancelled" : order.status || "processing"
        })
      });

      if (!res.ok) throw new Error("Failed to cancel item");

      toast.success("Item cancelled");
      // refresh local list
      fetchOrders();

      // notify other parts (dashboard/admin)
      window.dispatchEvent(new Event("ordersUpdated"));
    } catch (error) {
      console.error("Error cancelling item:", error);
      toast.error("Failed to cancel item");
    }
  };

  return (
    <div className='border-t pt-16'>
      <div className='text-2xl'>
        <Title text1="MY " text2="ORDERS" />
      </div>

      {orders.length === 0 && (
        <p className="text-center text-gray-500 mt-10">
          You have no orders yet.
        </p>
      )}

      <div>
        {orders.map((order, orderIndex) => (
          <div key={order.id || orderIndex} className="mb-10 pb-6 border-b">
            <p className="text-gray-500 mb-4">
              Order Date: {new Date(order.date).toDateString()}
            </p>

            {order.items.map((item, i) => (
              <div
                key={i}
                className="py-4 flex items-center justify-between gap-6 border-t"
              >
                {/* Product Info */}
                <div className="flex items-start gap-6 w-full md:w-[70%]">
                  <img className="w-20 sm:w-24" src={item.image} alt="" />
                  <div className="space-y-1">
                    <p className="text-lg font-semibold">{item.name}</p>
                    <p className="text-gray-700">{currency}{item.price}</p>
                    <p>Quantity: {item.quantity}</p>
                    <p>Size: {item.size}</p>

                    {/* small badge if cancelled */}
                    {item.cancelled && (
                      <span className="text-red-600 font-medium text-sm">
                        Cancelled
                      </span>
                    )}
                  </div>
                </div>

                {/* Cancel Button (for each item) */}
                <div className="flex flex-col items-end gap-3">
                  {!item.cancelled ? (
                    <button
                      onClick={() => cancelItem(order, i)}
                      className="border border-red-500 text-red-600 px-4 py-2 rounded hover:bg-red-600 hover:text-white transition"
                    >
                      Cancel Item
                    </button>
                  ) : (
                    <span className="text-red-600 font-semibold">Cancelled</span>
                  )}
                </div>
              </div>
            ))}

          </div>
        ))}
      </div>
    </div>
  )
}

export default Orders;
