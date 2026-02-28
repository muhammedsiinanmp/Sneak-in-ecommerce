import React, { useEffect, useState } from "react";
import { DollarSign, ShoppingCart, Package, Users, TrendingUp, PieChart as PieChartIcon } from "lucide-react";

const API = "http://localhost:3001";

// Enhanced Stat Card with gradient backgrounds
const StatCard = ({ title, value, icon, gradient = "from-indigo-500 to-indigo-600" }) => (
  <div className={`bg-gradient-to-br ${gradient} p-6 rounded-2xl text-white shadow-xl transform hover:scale-105 transition-transform duration-300`}>
    <div className="flex items-center justify-between mb-3">
      <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
        {icon}
      </div>
    </div>
    <p className="text-white/80 text-sm mb-1 font-medium">{title}</p>
    <p className="text-4xl font-extrabold tracking-tight">{value}</p>
  </div>
);

// Color palette for charts
const chartColors = ['#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#ef4444', '#10b981', '#8b5cf6', '#06b6d4'];

// Weekly Revenue Line Chart
const WeeklyRevenueChart = ({ data }) => {
  if (!data || data.length === 0) {
    return <div className="text-center py-16 text-gray-400">No sales data available for the last 7 days.</div>;
  }

  const values = data.map(d => d.revenue);
  const maxVal = Math.max(...values, 100);
  const minVal = 0;

  const padding = 50;
  const width = 600;
  const height = 280;
  const chartWidth = width - 2 * padding;
  const chartHeight = height - 2 * padding;

  const getY = (value) => {
    const normalized = (value - minVal) / (maxVal - minVal || 1);
    return height - padding - (normalized * chartHeight);
  };

  const points = data.map((d, i) => {
    const x = padding + i * (chartWidth / (data.length - 1));
    const y = getY(d.revenue);
    return `${x},${y}`;
  }).join(' ');

  // Create gradient area under the line
  const areaPoints = `${padding},${height - padding} ${points} ${padding + chartWidth},${height - padding}`;

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[650px]">
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="auto" className="drop-shadow-sm">
          <defs>
            <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0.05" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
            const y = height - padding - (ratio * chartHeight);
            return (
              <g key={i}>
                <line
                  x1={padding}
                  y1={y}
                  x2={width - padding}
                  y2={y}
                  stroke="#e5e7eb"
                  strokeWidth="1"
                  strokeDasharray={i === 0 ? "0" : "4 4"}
                />
                <text
                  x={padding - 10}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="11"
                  fill="#6b7280"
                  fontWeight="500"
                >
                  ₹{Math.round(minVal + ratio * (maxVal - minVal)).toLocaleString()}
                </text>
              </g>
            );
          })}

          {/* Area under line */}
          <polygon
            points={areaPoints}
            fill="url(#areaGradient)"
          />

          {/* Line path */}
          <polyline
            fill="none"
            stroke="#6366f1"
            strokeWidth="3"
            points={points}
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="drop-shadow(0 2px 4px rgba(99, 102, 241, 0.3))"
          />

          {/* Data points */}
          {data.map((d, i) => {
            const x = padding + i * (chartWidth / (data.length - 1));
            const y = getY(d.revenue);
            return (
              <g key={`dot-${i}`}>
                <circle
                  cx={x}
                  cy={y}
                  r="6"
                  fill="#fff"
                  stroke="#6366f1"
                  strokeWidth="3"
                  className="hover:r-8 transition-all cursor-pointer"
                />
                <title>{`${d.date}: ₹${d.revenue.toLocaleString()}`}</title>
              </g>
            );
          })}

          {/* X-axis labels */}
          {data.map((d, i) => {
            const x = padding + i * (chartWidth / (data.length - 1));
            return (
              <text
                key={i}
                x={x}
                y={height - padding + 25}
                textAnchor="middle"
                fontSize="11"
                fill="#6b7280"
                fontWeight="600"
              >
                {d.date}
              </text>
            );
          })}
        </svg>
      </div>
    </div>
  );
};

// Product Category Pie Chart
const CategoryPieChart = ({ data }) => {
  const total = data.reduce((sum, item) => sum + item.value, 0);

  if (total === 0) {
    return <div className="text-center py-16 text-gray-400">No product categories available.</div>;
  }

  let cumulativeAngle = 0;

  const pieData = data.map((item, index) => {
    const percentage = (item.value / total) * 100;
    const angle = (item.value / total) * 360;
    const startAngle = cumulativeAngle;
    cumulativeAngle += angle;

    return {
      ...item,
      percentage,
      startAngle,
      angle,
      color: chartColors[index % chartColors.length],
    };
  });

  const createArcPath = (centerX, centerY, radius, startAngle, endAngle) => {
    const start = polarToCartesian(centerX, centerY, radius, endAngle);
    const end = polarToCartesian(centerX, centerY, radius, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
    return `M ${centerX} ${centerY} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y} Z`;
  };

  const polarToCartesian = (centerX, centerY, radius, angleInDegrees) => {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
    return {
      x: centerX + radius * Math.cos(angleInRadians),
      y: centerY + radius * Math.sin(angleInRadians),
    };
  };

  const size = 240;
  const centerX = size / 2;
  const centerY = size / 2;
  const radius = size * 0.38;

  return (
    <div className="flex flex-col md:flex-row items-center justify-center gap-8 p-4">

      {/* Pie Chart */}
      <div className="relative w-[240px] h-[240px] flex-shrink-0">
        <svg viewBox={`0 0 ${size} ${size}`} width="100%" height="100%" className="drop-shadow-lg">
          {pieData.map((slice, index) => (
            <path
              key={slice.label}
              d={createArcPath(centerX, centerY, radius, slice.startAngle, slice.startAngle + slice.angle)}
              fill={slice.color}
              className="hover:opacity-80 transition-opacity cursor-pointer"
              strokeWidth="2"
              stroke="#fff"
            >
              <title>{`${slice.label}: ${slice.percentage.toFixed(1)}% (${slice.value} products)`}</title>
            </path>
          ))}
          {/* Center white circle for donut effect */}
          <circle cx={centerX} cy={centerY} r={radius * 0.5} fill="white" />
          <text x={centerX} y={centerY - 5} textAnchor="middle" fontSize="28" fontWeight="bold" fill="#1f2937">
            {total}
          </text>
          <text x={centerX} y={centerY + 15} textAnchor="middle" fontSize="12" fill="#6b7280">
            Products
          </text>
        </svg>
      </div>

      {/* Legend */}
      <div className="flex-1 max-w-xs">
        <div className="space-y-3">
          {pieData.map((slice) => (
            <div key={slice.label} className="flex justify-between items-center p-3 rounded-xl hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-3">
                <div
                  className="w-4 h-4 rounded-full shadow-sm"
                  style={{ backgroundColor: slice.color }}
                ></div>
                <span className="text-sm font-semibold text-gray-700">{slice.label}</span>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold text-gray-900">{slice.value}</div>
                <div className="text-xs text-gray-500">{slice.percentage.toFixed(1)}%</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Main Dashboard Component
const Dashboard = () => {
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [analytics, setAnalytics] = useState({
    totalRevenue: 0,
    averageOrderValue: 0,
    totalOrders: 0,
    topProducts: [],
    categoryDistribution: [],
    weeklyData: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [productsRes, ordersRes, usersRes] = await Promise.all([
        fetch(`${API}/products`),
        fetch(`${API}/orders`),
        fetch(`${API}/users`)
      ]);

      const productsData = productsRes.ok ? await productsRes.json() : [];
      const ordersData = ordersRes.ok ? await ordersRes.json() : [];
      const usersData = usersRes.ok ? await usersRes.json() : [];

      const safeProducts = Array.isArray(productsData) ? productsData : [];
      const safeOrders = Array.isArray(ordersData) ? ordersData : [];
      const safeUsers = Array.isArray(usersData) ? usersData : [];

      setProducts(safeProducts);
      setOrders(safeOrders);
      setUsers(safeUsers);

      // All-time analytics
      const totalOrders = safeOrders.length;

      const calculateOrderRevenue = (order) =>
        (order.items || []).reduce((sum, item) =>
          sum + (item.cancelled ? 0 : (item.price || 0) * (item.quantity || 0)), 0);

      const totalRevenue = safeOrders.reduce((sum, order) => sum + calculateOrderRevenue(order), 0);
      const averageOrderValue = totalOrders > 0 ? (totalRevenue / totalOrders) : 0;

      // Top Products
      const productSales = {};
      safeOrders.forEach(order => {
        (order.items || []).forEach(item => {
          if (item && !item.cancelled) {
            if (!productSales[item.productId]) {
              productSales[item.productId] = {
                name: item.name,
                quantity: 0,
                revenue: 0,
                image: item.image
              };
            }
            productSales[item.productId].quantity += item.quantity || 0;
            productSales[item.productId].revenue += (item.price || 0) * (item.quantity || 0);
          }
        });
      });
      const topProducts = Object.values(productSales)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);

      // Category Distribution (from products)
      const categoryCount = {};
      safeProducts.forEach(product => {
        const category = product.category || "Other";
        categoryCount[category] = (categoryCount[category] || 0) + 1;
      });
      const categoryDistribution = Object.entries(categoryCount)
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value);

      // Weekly Data (Last 7 Days)
      const now = new Date();
      const weeklyData = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const dayOrders = safeOrders.filter(o => {
          const orderDate = new Date(o.date);
          return orderDate.getFullYear() === date.getFullYear() &&
            orderDate.getMonth() === date.getMonth() &&
            orderDate.getDate() === date.getDate();
        });
        const dayRevenue = dayOrders.reduce((sum, order) => sum + calculateOrderRevenue(order), 0);

        weeklyData.push({
          date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          revenue: dayRevenue,
          orders: dayOrders.length
        });
      }

      setAnalytics({
        totalRevenue,
        averageOrderValue,
        totalOrders,
        topProducts,
        categoryDistribution,
        weeklyData
      });
    } catch (err) {
      console.error("Failed to fetch admin data", err);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-indigo-500 border-t-transparent"></div>
          <p className="mt-4 text-lg text-gray-600 font-medium">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8 bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-50">

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-extrabold text-gray-900 mb-2">Admin Dashboard</h1>
        <p className="text-gray-600">Overview of your store performance</p>
      </div>

      {/* All-Time Stats */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">All-Time Analytics</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            title="Total Revenue"
            value={`₹${analytics.totalRevenue.toLocaleString()}`}
            icon={<DollarSign className="w-8 h-8" />}
            gradient="from-green-500 to-emerald-600"
          />
          <StatCard
            title="Total Orders"
            value={analytics.totalOrders.toLocaleString()}
            icon={<ShoppingCart className="w-8 h-8" />}
            gradient="from-blue-500 to-indigo-600"
          />
          <StatCard
            title="Avg Order Value"
            value={`₹${Math.round(analytics.averageOrderValue).toLocaleString()}`}
            icon={<TrendingUp className="w-8 h-8" />}
            gradient="from-purple-500 to-pink-600"
          />
          <StatCard
            title="Total Products"
            value={products.length.toLocaleString()}
            icon={<Package className="w-8 h-8" />}
            gradient="from-amber-500 to-orange-600"
          />
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">

        {/* Weekly Revenue Chart - FIXED SIZE, NO OVERFLOW */}
        <div className="bg-white rounded-2xl shadow-xl p-4 sm:p-6 border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-gray-800">Weekly Revenue</h3>
            <span className="px-3 py-1 bg-indigo-100 text-indigo-700 text-sm font-semibold rounded-full">
              Last 7 Days
            </span>
          </div>

          {/* Scale down the chart to prevent overflow */}
          <div className="w-full overflow-hidden">
            <div className="scale-90 sm:scale-95 origin-top">
              <WeeklyRevenueChart data={analytics.weeklyData} />
            </div>
          </div>
        </div>

        {/* Category Distribution - FIXED SIZE, NO OVERFLOW */}
        <div className="bg-white rounded-2xl shadow-xl p-4 sm:p-6 border border-gray-100">
          <h3 className="text-xl font-bold text-gray-800 mb-4">Product Categories</h3>

          <div className="w-full overflow-hidden">
            <div className="scale-90 sm:scale-95 origin-top">
              <CategoryPieChart data={analytics.categoryDistribution} />
            </div>
          </div>
        </div>

      </div>


      {/* Bottom Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Top Products */}
        <div className="bg-white rounded-2xl shadow-xl p-6 border border-gray-100 overflow-hidden">
          <h3 className="text-xl font-bold text-gray-800 mb-6">Top Selling Products</h3>

          <div className="space-y-4">
            {analytics.topProducts.map((product, idx) => (
              <div
                key={idx}
                className="flex items-center gap-4 p-3 bg-gradient-to-r from-gray-50 to-white rounded-xl 
                   border border-gray-100 hover:shadow-md transition-shadow overflow-hidden"
              >

                {/* Rank Badge */}
                <div className="w-10 h-10 flex items-center justify-center text-white text-base font-bold 
                        rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 shadow-md shrink-0">
                  {idx + 1}
                </div>

                {/* Product Image */}
                <img
                  src={product.image}
                  alt={product.name}
                  className="w-14 h-14 object-cover rounded-lg border-2 border-gray-200 shrink-0"
                />

                {/* Product Text */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-800 text-sm truncate">
                    {product.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    Sold: <span className="text-indigo-600">{product.quantity}</span>
                  </p>
                </div>

                {/* Revenue */}
                <div className="text-right shrink-0">
                  <p className="font-bold text-green-600">
                    ₹{product.revenue.toLocaleString()}
                  </p>
                </div>

              </div>
            ))}

            {analytics.topProducts.length === 0 && (
              <div className="text-gray-400 py-8 text-center">No sales data available</div>
            )}
          </div>
        </div>

        {/* Recent Orders */}
        <div className="bg-white rounded-2xl shadow-xl p-6 border border-gray-100">
          <h3 className="text-xl font-bold text-gray-800 mb-6">Recent Orders</h3>
          <div className="space-y-2">
            {orders.slice().reverse().slice(0, 8).map((order) => (
              <div
                key={order.id}
                className="flex justify-between items-center p-4 hover:bg-gray-50 rounded-xl border border-transparent hover:border-gray-200 transition"
              >
                <div>
                  <div className="font-semibold text-gray-800">Order #{order.id}</div>
                  <div className="text-xs text-gray-500">
                    {new Date(order.date).toLocaleDateString()} •{" "}
                    {new Date(order.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <span className={`px-3 py-1 text-xs font-semibold rounded-full capitalize ${order.status === "delivered"
                    ? "bg-green-100 text-green-700"
                    : order.status === "shipped"
                      ? "bg-blue-100 text-blue-700"
                      : order.status === "processing"
                        ? "bg-yellow-100 text-yellow-700"
                        : "bg-gray-100 text-gray-700"
                    }`}>
                    {order.status || "processing"}
                  </span>

                  <div className="text-base font-bold text-gray-900 min-w-[80px] text-right">
                    ₹{order.items.reduce((s, it) =>
                      s + (it.price || 0) * (it.quantity || 1), 0
                    ).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}

            {orders.length === 0 && (
              <div className="text-center text-gray-400 py-12">No orders yet</div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
};

export default Dashboard;