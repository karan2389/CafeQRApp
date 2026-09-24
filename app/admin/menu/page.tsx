"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { 
  Plus, 
  Edit2, 
  Trash2, 
  Upload, 
  X, 
  Loader2, 
  AlertTriangle, 
  Image as ImageIcon,
  ShieldAlert,
  Search
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getSupabaseClient } from "@/lib/supabase/client";
import { formatINR } from "@/lib/format";
import type { DbMenuItem, DbMenuCategory } from "@/types/database";

export default function AdminMenuPage() {
  const [items, setItems] = useState<DbMenuItem[]>([]);
  const [categories, setCategories] = useState<DbMenuCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("all");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<DbMenuItem | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    category_id: "",
    description: "",
    price: 0,
    image_url: "",
    is_available: true,
    requires_age_confirmation: false,
    display_order: 0,
  });

  // Delete Confirmation State
  const [deletingItem, setDeletingItem] = useState<DbMenuItem | null>(null);

  const fetchData = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      toast.error("Supabase not configured. Please check environment variables.");
      setLoading(false);
      return;
    }

    try {
      const [catsRes, itemsRes] = await Promise.all([
        supabase.from("menu_categories").select("*").order("display_order", { ascending: true }),
        supabase.from("menu_items").select("*").order("display_order", { ascending: true }),
      ]);

      if (catsRes.error) throw catsRes.error;
      if (itemsRes.error) throw itemsRes.error;

      setCategories(catsRes.data || []);
      setItems(itemsRes.data || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load menu data";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    const timer = window.setTimeout(() => {
      if (isMounted) {
        void fetchData();
      }
    }, 0);
    return () => {
      isMounted = false;
      window.clearTimeout(timer);
    };
  }, [fetchData]);

  const openCreateModal = () => {
    setEditingItem(null);
    setFormData({
      name: "",
      category_id: categories[0]?.id || "",
      description: "",
      price: 150,
      image_url: "",
      is_available: true,
      requires_age_confirmation: false,
      display_order: (items.length + 1) * 10,
    });
    setIsModalOpen(true);
  };

  const openEditModal = (item: DbMenuItem) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      category_id: item.category_id,
      description: item.description || "",
      price: Number(item.price),
      image_url: item.image_url || "",
      is_available: item.is_available,
      requires_age_confirmation: item.requires_age_confirmation,
      display_order: item.display_order,
    });
    setIsModalOpen(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image file size exceeds 5MB limit");
      return;
    }

    setUploadingImage(true);
    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch("/api/admin/upload", {
        method: "POST",
        body: form,
      });

      const data = (await res.json()) as { error?: string; url?: string };
      if (!res.ok) {
        throw new Error(data.error || "Image upload failed");
      }

      setFormData((prev) => ({ ...prev, image_url: data.url || "" }));
      toast.success("Image uploaded to Cloudflare R2!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to upload image";
      toast.error(msg);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.category_id) {
      toast.error("Name and category are required");
      return;
    }

    if (formData.price <= 0) {
      toast.error("Price must be greater than ₹0");
      return;
    }

    setSaving(true);

    try {
      if (editingItem) {
        // Update existing item via API
        const res = await fetch(`/api/admin/menu/${editingItem.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formData.name.trim(),
            category_id: formData.category_id,
            description: formData.description.trim() || null,
            price: Number(formData.price),
            image_url: formData.image_url.trim() || null,
            is_available: formData.is_available,
            requires_age_confirmation: formData.requires_age_confirmation,
            display_order: Number(formData.display_order),
          }),
        });

        const data = (await res.json()) as { error?: string; item?: DbMenuItem };
        if (!res.ok) {
          throw new Error(data.error || "Failed to update item");
        }
        toast.success(`Updated "${formData.name}"`);
      } else {
        // Create new item via API
        const res = await fetch("/api/admin/menu", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formData.name.trim(),
            category_id: formData.category_id,
            description: formData.description.trim() || null,
            price: Number(formData.price),
            image_url: formData.image_url.trim() || null,
            is_available: formData.is_available,
            requires_age_confirmation: formData.requires_age_confirmation,
            display_order: Number(formData.display_order),
          }),
        });

        const data = (await res.json()) as { error?: string; item?: DbMenuItem };
        if (!res.ok) {
          throw new Error(data.error || "Failed to create item");
        }
        toast.success(`Created "${formData.name}"`);
      }

      setIsModalOpen(false);
      await fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save item";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const toggleAvailability = async (item: DbMenuItem) => {
    try {
      const newStatus = !item.is_available;
      const res = await fetch(`/api/admin/menu/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_available: newStatus }),
      });

      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Failed to toggle availability");
      }

      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, is_available: newStatus } : i))
      );
      toast.success(`${item.name} is now ${newStatus ? "in stock" : "marked sold out"}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to toggle availability";
      toast.error(msg);
    }
  };

  const executeHardDelete = async () => {
    if (!deletingItem) return;
    setSaving(true);

    try {
      const res = await fetch(`/api/admin/menu/${deletingItem.id}`, {
        method: "DELETE",
      });

      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete item");
      }

      toast.success(`Permanently deleted "${deletingItem.name}"`);
      setDeletingItem(null);
      await fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete item";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const filteredItems = items.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory =
      selectedCategoryFilter === "all" || item.category_id === selectedCategoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Menu Catalog</h1>
          <p className="text-stone-400 text-sm mt-0.5">
            Manage food & drink items, update Rupee pricing, upload Cloudflare R2 images, and toggle availability
          </p>
        </div>
        <Button
          onClick={openCreateModal}
          className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold shadow-md"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Menu Item
        </Button>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-stone-900/80 border border-stone-800 p-4 rounded-2xl flex flex-col sm:flex-row items-center gap-4">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-500" />
          <input
            type="text"
            placeholder="Search items by name or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-stone-800/80 border border-stone-700/80 rounded-xl text-stone-100 placeholder-stone-500 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
          />
        </div>

        <div className="w-full sm:w-auto flex items-center gap-2">
          <span className="text-xs text-stone-400 font-medium shrink-0">Category:</span>
          <select
            value={selectedCategoryFilter}
            onChange={(e) => setSelectedCategoryFilter(e.target.value)}
            className="w-full sm:w-48 bg-stone-800 border border-stone-700 text-stone-200 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
          >
            <option value="all">All Categories ({items.length})</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Menu Items Table */}
      <div className="bg-stone-900/90 border border-stone-800 rounded-2xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-stone-400 space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
            <p className="text-sm">Loading menu items from Supabase...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="py-16 text-center text-stone-400 space-y-3">
            <p className="text-base font-medium text-stone-300">No items found</p>
            <p className="text-xs text-stone-500 max-w-sm mx-auto">
              {searchQuery || selectedCategoryFilter !== "all"
                ? "Try adjusting your search or category filter."
                : "Add your first menu item to populate your cafe ordering system."}
            </p>
            <Button onClick={openCreateModal} variant="outline" className="border-stone-700 text-stone-200">
              Create First Menu Item
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-stone-300">
              <thead className="bg-stone-850/80 text-stone-400 text-xs uppercase tracking-wider border-b border-stone-800">
                <tr>
                  <th className="px-6 py-4 font-semibold">Item</th>
                  <th className="px-6 py-4 font-semibold">Category</th>
                  <th className="px-6 py-4 font-semibold">Price (₹)</th>
                  <th className="px-6 py-4 font-semibold text-center">Availability</th>
                  <th className="px-6 py-4 font-semibold text-center">Age Restricted</th>
                  <th className="px-6 py-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-800/80 font-normal">
                {filteredItems.map((item) => {
                  const categoryName =
                    categories.find((c) => c.id === item.category_id)?.name || "Uncategorized";

                  return (
                    <tr key={item.id} className="hover:bg-stone-850/40 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3.5">
                          <div className="w-12 h-12 rounded-xl bg-stone-800 border border-stone-700/80 overflow-hidden shrink-0 flex items-center justify-center text-stone-500 relative">
                            {item.image_url ? (
                              <img
                                src={item.image_url}
                                alt={item.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <ImageIcon className="w-5 h-5 text-stone-600" />
                            )}
                          </div>
                          <div>
                            <span className="font-semibold text-white block">{item.name}</span>
                            <span className="text-xs text-stone-400 line-clamp-1 max-w-xs">
                              {item.description || "No description provided"}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <span className="bg-stone-800 border border-stone-700/80 px-2.5 py-1 rounded-lg text-xs font-medium text-stone-300">
                          {categoryName}
                        </span>
                      </td>

                      <td className="px-6 py-4 font-semibold text-amber-400">
                        {formatINR(item.price)}
                      </td>

                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => toggleAvailability(item)}
                          className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                            item.is_available
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20"
                              : "bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20"
                          }`}
                        >
                          {item.is_available ? "In Stock" : "Sold Out"}
                        </button>
                      </td>

                      <td className="px-6 py-4 text-center">
                        {item.requires_age_confirmation ? (
                          <span className="inline-flex items-center gap-1 text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-md font-medium">
                            <ShieldAlert className="w-3 h-3" />
                            18+ Required
                          </span>
                        ) : (
                          <span className="text-stone-500 text-xs">—</span>
                        )}
                      </td>

                      <td className="px-6 py-4 text-right space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditModal(item)}
                          className="text-stone-400 hover:text-white hover:bg-stone-800"
                        >
                          <Edit2 className="w-3.5 h-3.5 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeletingItem(item)}
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-1" />
                          Delete
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Menu Item Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl animate-in zoom-in-95 my-8">
            <div className="flex items-center justify-between border-b border-stone-800 pb-4">
              <h2 className="text-lg font-bold text-white">
                {editingItem ? "Edit Menu Item" : "Create New Menu Item"}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-stone-400 hover:text-white rounded-lg p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-stone-300">
                  Item Name
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Cardamom Bun"
                  className="w-full px-3.5 py-2.5 bg-stone-800 border border-stone-700 rounded-xl text-stone-100 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-stone-300">
                    Category
                  </label>
                  <select
                    required
                    value={formData.category_id}
                    onChange={(e) => setFormData((p) => ({ ...p, category_id: e.target.value }))}
                    className="w-full px-3.5 py-2.5 bg-stone-800 border border-stone-700 rounded-xl text-stone-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  >
                    <option value="" disabled>
                      Select Category
                    </option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-stone-300">
                    Price in Rupees (₹)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 font-semibold">
                      ₹
                    </span>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      required
                      value={formData.price}
                      onChange={(e) =>
                        setFormData((p) => ({ ...p, price: parseFloat(e.target.value) || 0 }))
                      }
                      placeholder="180"
                      className="w-full pl-8 pr-3.5 py-2.5 bg-stone-800 border border-stone-700 rounded-xl text-stone-100 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-stone-300">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Describe ingredients, preparation, and flavor notes..."
                  className="w-full px-3.5 py-2.5 bg-stone-800 border border-stone-700 rounded-xl text-stone-100 placeholder-stone-500 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-none"
                />
              </div>

              {/* Cloudflare R2 Image Upload */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-stone-300">
                  Item Image (Cloudflare R2)
                </label>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-xl bg-stone-800 border border-stone-700 overflow-hidden shrink-0 flex items-center justify-center text-stone-500 relative">
                    {formData.image_url ? (
                      <img
                        src={formData.image_url}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="w-6 h-6 text-stone-600" />
                    )}
                  </div>

                  <div className="flex-1 space-y-2">
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept="image/jpeg,image/png,image/webp,image/svg+xml,image/avif"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={uploadingImage}
                      onClick={() => fileInputRef.current?.click()}
                      className="border-stone-700 text-stone-300 hover:bg-stone-800 text-xs w-full"
                    >
                      {uploadingImage ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
                          Uploading to R2...
                        </>
                      ) : (
                        <>
                          <Upload className="w-3.5 h-3.5 mr-2" />
                          Upload to Cloudflare R2
                        </>
                      )}
                    </Button>
                    <input
                      type="text"
                      value={formData.image_url}
                      onChange={(e) => setFormData((p) => ({ ...p, image_url: e.target.value }))}
                      placeholder="Or enter image URL (/menu/espresso.svg)"
                      className="w-full px-3 py-1.5 bg-stone-800/80 border border-stone-700/80 rounded-lg text-xs font-mono text-stone-300 placeholder-stone-500"
                    />
                  </div>
                </div>
              </div>

              {/* Switches */}
              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-stone-800">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_available}
                    onChange={(e) => setFormData((p) => ({ ...p, is_available: e.target.checked }))}
                    className="rounded border-stone-700 text-amber-500 focus:ring-amber-500 w-4 h-4 bg-stone-800"
                  />
                  <span className="text-xs font-medium text-stone-200">Available (In Stock)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.requires_age_confirmation}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, requires_age_confirmation: e.target.checked }))
                    }
                    className="rounded border-stone-700 text-amber-500 focus:ring-amber-500 w-4 h-4 bg-stone-800"
                  />
                  <span className="text-xs font-medium text-stone-200">18+ Age Gate</span>
                </label>
              </div>

              <div className="pt-4 border-t border-stone-800 flex justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsModalOpen(false)}
                  className="border-stone-700 text-stone-300 hover:bg-stone-800"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={saving || uploadingImage}
                  className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  {editingItem ? "Save Changes" : "Create Item"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingItem && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl animate-in zoom-in-95">
            <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center space-y-2">
              <h2 className="text-lg font-bold text-white">Permanently Delete Item?</h2>
              <p className="text-stone-400 text-sm">
                Are you sure you want to delete <strong className="text-white">{deletingItem.name}</strong>?
                This action is permanent and cannot be undone.
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setDeletingItem(null)}
                className="border-stone-700 text-stone-300 hover:bg-stone-800"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={executeHardDelete}
                disabled={saving}
                className="bg-red-600 hover:bg-red-500 font-semibold"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Confirm Hard Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
