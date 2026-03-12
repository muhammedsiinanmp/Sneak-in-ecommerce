import React, { useEffect, useState, useContext, useCallback } from "react";
import { ShopContext } from "../../context/ShopContext";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

const emptyProduct = {
  id: "", name: "", price: "", mrp: "", brand: "", category: "", subcategory: "",
  sizes: [], images: [], description: "", in_stock: true, bestseller: false, stock: 0
};

const AdminProducts = () => {
  const { authFetch } = useContext(ShopContext);
  const [products, setProducts] = useState([]);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${API}/admin/products/?page_size=100`);
      if (res?.ok) {
        const data = await res.json();
        setProducts(Array.isArray(data.results || data) ? (data.results || data) : []);
      }
    } catch (err) { console.error(err); }
    setLoading(false);
  }, [authFetch]);

  useEffect(() => {
    const timer = setTimeout(() => {
      load();
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const openNew = () => { setEditing({ ...emptyProduct }); setModalOpen(true); };
  const openEdit = (p) => {
    setEditing({
      ...p,
      sizes: p.sizes?.map(s => String(s.size_value)) || [],
      images: p.images?.map(i => i.image_url) || []
    });
    setModalOpen(true);
  };

  const save = async (product) => {
    try {
      const payload = {
        name: product.name, price: product.price, mrp: product.mrp || product.price,
        description: product.description, brand: product.brand || null,
        category: product.category || null, subcategory: product.subcategory || null,
        in_stock: product.in_stock, bestseller: product.bestseller, stock: product.stock || 0,
        images: product.images?.map((url, i) => ({ image_url: url, display_order: i })) || [],
        sizes: product.sizes?.map(size => ({ size_value: Number(size), stock: 10 })) || []
      };
      const isUpdate = !!product.id;
      const url = isUpdate ? `${API}/admin/products/${product.id}/` : `${API}/admin/products/`;
      const res = await authFetch(url, { method: isUpdate ? "PATCH" : "POST", body: JSON.stringify(payload) });
      if (!res?.ok) { const e = await res?.json(); alert("Error: " + JSON.stringify(e)); return; }
      setModalOpen(false);
      load();
    } catch (err) { console.error(err); alert("Failed to save product"); }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this product permanently?")) return;
    try { await authFetch(`${API}/admin/products/${id}/`, { method: "DELETE" }); load(); }
    catch (err) { console.error(err); }
  };

  const filtered = products.filter(p =>
    p.name?.toLowerCase().includes(q.toLowerCase()) ||
    (p.category_name || "").toLowerCase().includes(q.toLowerCase()) ||
    (p.brand_name || "").toLowerCase().includes(q.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <div className="animate-spin w-8 h-8 border-2 border-gray-900 border-t-transparent mb-4"></div>
        <p className="text-sm text-gray-400">Loading products...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Products</h2>
          <p className="text-sm text-gray-500 mt-1">{products.length} products in inventory</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <div className="relative">
            <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products..."
              className="w-full sm:w-64 border border-gray-200 px-4 py-2.5 pl-10 text-sm focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-200 transition-all" />
          </div>
          <button onClick={openNew}
            className="bg-gray-900 text-white px-5 py-2.5 text-sm font-semibold hover:bg-gray-800 active:scale-[0.98] transition-all">
            + Add Product
          </button>
        </div>
      </div>

      {/* Product Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Total</p>
          <p className="text-2xl font-bold text-gray-900">{products.length}</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-100 p-5">
          <p className="text-xs font-medium text-emerald-600 uppercase tracking-wider mb-1">In Stock</p>
          <p className="text-2xl font-bold text-emerald-700">{products.filter(p => p.in_stock).length}</p>
        </div>
        <div className="bg-amber-50 border border-amber-100 p-5">
          <p className="text-xs font-medium text-amber-600 uppercase tracking-wider mb-1">Bestsellers</p>
          <p className="text-2xl font-bold text-amber-700">{products.filter(p => p.bestseller).length}</p>
        </div>
      </div>

      {/* Product Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {filtered.map(p => (
          <div key={p.id} className="bg-white border border-gray-200 overflow-hidden group hover:shadow-lg transition-all duration-300">
            <div className="aspect-[4/3] bg-gray-50 overflow-hidden relative">
              <img
                src={p.images?.[0]?.image_url || "https://via.placeholder.com/400x300?text=No+Image"}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                alt={p.name}
              />
              {p.bestseller && (
                <span className="absolute top-2 left-2 text-[9px] bg-gray-900 text-white px-2 py-0.5 font-bold uppercase tracking-wider">
                  Bestseller
                </span>
              )}
              {!p.in_stock && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <span className="text-xs font-bold text-white bg-red-600 px-3 py-1 uppercase">Out of Stock</span>
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
                <div className="flex gap-2">
                  <button onClick={() => openEdit(p)}
                    className="flex-1 bg-white text-gray-900 py-1.5 text-[11px] font-semibold hover:bg-gray-100 transition-colors">
                    Edit
                  </button>
                  <button onClick={() => remove(p.id)}
                    className="flex-1 bg-white/10 backdrop-blur text-white border border-white/20 py-1.5 text-[11px] font-semibold hover:bg-red-600 hover:border-red-600 transition-colors">
                    Delete
                  </button>
                </div>
              </div>
            </div>
            <div className="p-3">
              <h4 className="text-sm font-medium text-gray-800 truncate">{p.name}</h4>
              <p className="text-xs text-gray-400 mt-0.5 truncate">{p.brand_name} · {p.category_name}</p>
              <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-100">
                <p className="text-base font-bold text-gray-900">₹{Number(p.price)?.toLocaleString()}</p>
                <div className="flex items-center gap-1.5">
                  <div className={`w-1.5 h-1.5 ${p.in_stock && p.stock > 10 ? 'bg-emerald-500' : p.in_stock ? 'bg-amber-500' : 'bg-red-500'}`}></div>
                  <span className="text-[10px] font-medium text-gray-500">{p.stock}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="bg-white border border-dashed border-gray-200 p-16 text-center">
          <p className="text-sm text-gray-400">No products match your search</p>
        </div>
      )}

      {/* Product Modal */}
      {modalOpen && <ProductModal key={editing?.id || 'new'} product={editing} onClose={() => setModalOpen(false)} onSave={save} />}
    </div>
  );
};

export default AdminProducts;

/* ─── Product Modal ─── */
const ProductModal = ({ product, onClose, onSave }) => {
  const [form, setForm] = useState(product || {});
  const [meta, setMeta] = useState({ brands: [], categories: [], subcategories: [] });
  const [imgInput, setImgInput] = useState("");

  useEffect(() => {
    const fetchMeta = async () => {
      try {
        const [b, c, s] = await Promise.all([
          fetch(`${API}/brands/`), fetch(`${API}/categories/`), fetch(`${API}/subcategories/`)
        ]);
        setMeta({
          brands: b.ok ? await b.json() : [],
          categories: c.ok ? await c.json() : [],
          subcategories: s.ok ? await s.json() : [],
        });
      } catch (err) { console.error("Meta load fail", err); }
    };
    fetchMeta();
  }, []);

  const u = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const toggleSize = (sz) => {
    const sizes = Array.isArray(form.sizes) ? form.sizes.slice() : [];
    setForm(p => ({ ...p, sizes: sizes.includes(sz) ? sizes.filter(s => s !== sz) : [...sizes, sz] }));
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 sm:p-8 overflow-y-auto">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white w-full max-w-2xl shadow-2xl z-10 my-4">
        <div className="flex justify-between items-center px-6 py-5 border-b border-gray-100">
          <h4 className="text-lg font-bold text-gray-900">
            {product?.id ? "Edit Product" : "New Product"}
          </h4>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 text-gray-400 hover:text-gray-800">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Product Name</label>
              <input value={form.name || ""} onChange={(e) => u("name", e.target.value)}
                className="mt-1.5 w-full border border-gray-200 px-4 py-2.5 text-sm focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-200" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Price (₹)</label>
              <input type="number" value={form.price || ""} onChange={(e) => u("price", e.target.value)}
                className="mt-1.5 w-full border border-gray-200 px-4 py-2.5 text-sm focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-200" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Stock</label>
              <input type="number" value={form.stock || ""} onChange={(e) => u("stock", e.target.value)}
                className="mt-1.5 w-full border border-gray-200 px-4 py-2.5 text-sm focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-200" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Brand</label>
              <select value={form.brand || ""} onChange={(e) => u("brand", Number(e.target.value))}
                className="mt-1.5 w-full border border-gray-200 px-4 py-2.5 text-sm focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-200 appearance-none">
                <option value="">Select Brand</option>
                {meta.brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Category</label>
              <select value={form.category || ""} onChange={(e) => u("category", Number(e.target.value))}
                className="mt-1.5 w-full border border-gray-200 px-4 py-2.5 text-sm focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-200 appearance-none">
                <option value="">Select Category</option>
                {meta.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Subcategory</label>
              <select value={form.subcategory || ""} onChange={(e) => u("subcategory", Number(e.target.value))}
                className="mt-1.5 w-full border border-gray-200 px-4 py-2.5 text-sm focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-200 appearance-none">
                <option value="">Select Subcategory</option>
                {meta.subcategories.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">MRP (₹)</label>
              <input type="number" value={form.mrp || ""} onChange={(e) => u("mrp", e.target.value)}
                className="mt-1.5 w-full border border-gray-200 px-4 py-2.5 text-sm focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-200" />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Description</label>
              <textarea value={form.description || ""} onChange={(e) => u("description", e.target.value)} rows="3"
                className="mt-1.5 w-full border border-gray-200 px-4 py-2.5 text-sm focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-200" />
            </div>
          </div>

          {/* Toggles */}
          <div className="flex gap-6 p-4 bg-gray-50">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.in_stock ?? true} onChange={(e) => u("in_stock", e.target.checked)} className="w-4 h-4 accent-gray-900" />
              <span className="text-sm text-gray-700 font-medium">In Stock</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.bestseller ?? false} onChange={(e) => u("bestseller", e.target.checked)} className="w-4 h-4 accent-gray-900" />
              <span className="text-sm text-gray-700 font-medium">Bestseller</span>
            </label>
          </div>

          {/* Sizes */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Sizes</p>
            <div className="flex flex-wrap gap-2">
              {["5","6","7","8","9","10","11","12"].map(sz => (
                <button key={sz} onClick={() => toggleSize(sz)}
                  className={`px-4 py-2 border text-sm font-medium transition-all ${
                    Array.isArray(form.sizes) && form.sizes.includes(sz)
                      ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-700 border-gray-200 hover:border-gray-400"
                  }`}>{sz}</button>
              ))}
            </div>
          </div>

          {/* Images */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Images</p>
            <div className="flex gap-2 items-center">
              <input placeholder="Paste image URL" value={imgInput} onChange={(e) => setImgInput(e.target.value)}
                className="border border-gray-200 px-4 py-2.5 flex-1 text-sm focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-200" />
              <button onClick={() => {
                if (imgInput.trim()) { u("images", [...(form.images || []), imgInput.trim()]); setImgInput(""); }
              }} className="px-5 py-2.5 bg-gray-900 text-white text-sm font-medium">Add</button>
            </div>
            <div className="flex gap-2 mt-3 flex-wrap">
              {(form.images || []).map((url, i) => (
                <div key={i} className="relative group">
                  <img src={url} alt="" className="w-16 h-16 object-cover border border-gray-200" />
                  <button onClick={() => u("images", (form.images || []).filter((_, idx) => idx !== i))}
                    className="absolute -top-1.5 -right-1.5 bg-red-500 text-white w-5 h-5 flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity shadow">×</button>
                </div>
              ))}
            </div>
            {(!form.images || form.images.length === 0) && (
              <p className="text-xs text-gray-400 mt-2 p-4 border border-dashed border-gray-200 text-center">No images added</p>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={() => onSave(form)}
            className="px-5 py-2.5 text-sm font-semibold text-white bg-gray-900 hover:bg-gray-800 transition-colors">
            {product?.id ? "Update" : "Create"} Product
          </button>
        </div>
      </div>
    </div>
  );
};