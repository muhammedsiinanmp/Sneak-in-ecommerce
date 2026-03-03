import React, { useContext, useEffect, useState } from 'react'
import { ShopContext } from '../context/ShopContext'
import { AuthContext } from '../context/AuthContext'
import Title from '../components/Title'
import { toast } from 'react-toastify'

const API = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

const Orders = () => {
  const { currency, authFetch } = useContext(ShopContext);
  const { user } = useContext(AuthContext);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = async () => {
    if (!user) return;

    try {
      const res = await authFetch(`${API}/orders/`);
      if (!res) return;

      const data = await res.json();
      // Handle paginated or plain array
      setOrders(data.results || data || []);
    } catch (err) {
      console.error("Failed to fetch orders:", err);
    } finally {
      setLoading(false);
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
  const cancelOrder = async (orderId) => {
    try {
      const res = await authFetch(`${API}/orders/${orderId}/cancel/`, {
        method: "PATCH",
      });

      if (!res || !res.ok) throw new Error("Failed to cancel order");

      toast.success("Order cancelled");
      fetchOrders();

      // notify other parts (dashboard/admin)
      window.dispatchEvent(new Event("ordersUpdated"));
    } catch (error) {
      console.error("Error cancelling order:", error);
      toast.error("Failed to cancel order");
    }
  };

  if (loading) return <div className="text-center py-20">Loading orders...</div>

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
            <div className="flex justify-between items-center bg-gray-50 p-3 rounded mb-4">
              <p className="text-gray-600 font-medium">
                Order ID: #{order.id} | Date: {new Date(order.created_at).toDateString()}
              </p>
              <div className="flex items-center gap-4">
                <p className="capitalize">Status: <span className={`font-semibold ${order.status === 'cancelled' ? 'text-red-500' : 'text-green-600'}`}>{order.status}</span></p>
                {order.status !== 'cancelled' && order.status !== 'delivered' && (
                  <button
                    onClick={() => cancelOrder(order.id)}
                    className="text-sm border border-red-500 text-red-500 px-3 py-1 rounded hover:bg-red-50"
                  >
                    Cancel Order
                  </button>
                )}
              </div>
            </div>

            {order.items.map((item, i) => (
              <div
                key={i}
                className="py-4 flex items-center justify-between gap-6 border-t"
              >
                {/* Product Info */}
                <div className="flex items-start gap-6 w-full md:w-[70%]">
                  <img
                    className="w-16 sm:w-20 object-contain h-20 border"
                    src={item.product_image}
                    alt={item.product_name}
                  />
                  <div className="space-y-1">
                    <p className="text-lg font-semibold">{item.product_name}</p>
                    <p className="text-gray-700">{currency}{item.price}</p>
                    <p className="text-sm">Quantity: {item.quantity}</p>
                    <p className="text-sm">Size: {item.size}</p>

                    {/* small badge if cancelled */}
                    {item.cancelled && (
                      <span className="text-red-600 font-medium text-sm">
                        Item Cancelled
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-right">
                  <p className="text-lg font-medium">{currency}{(item.price * item.quantity).toFixed(2)}</p>
                </div>
              </div>
            ))}

            <div className="flex justify-end mt-4 pt-4 border-t">
              <p className="text-xl font-bold">Total: {currency}{order.total_amount}</p>
            </div>

          </div>
        ))}
      </div>
    </div>
  )
}

export default Orders;
