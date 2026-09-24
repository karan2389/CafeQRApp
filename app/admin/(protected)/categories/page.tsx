"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Edit2, Trash2, X, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { DbMenuCategory } from "@/types/database";

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<DbMenuCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [defaultBranchId, setDefaultBranchId] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<DbMenuCategory | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    display_order: 0,
    is_active: true,
  });

  // Delete Confirmation State
  const [deletingCategory, setDeletingCategory] = useState<DbMenuCategory | null>(null);
  const [itemCountForCategory, setItemCountForCategory] = useState<number | null>(null);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/categories", {
        headers: { "Cache-Control": "no-cache" },
      });

      if (!res.ok) {
        const errorData = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errorData.error || `HTTP error ${res.status}`);
      }

      const data = (await res.json()) as DbMenuCategory[];
      setCategories(Array.isArray(data) ? data : []);

      // Also get default branch ID if available
      const supabase = getSupabaseClient();
      if (supabase) {
        const { data: branch } = await supabase.from("branches").select("id").limit(1).maybeSingle();
        if (branch) setDefaultBranchId(branch.id);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load categories";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    const timer = window.setTimeout(() => {
      if (isMounted) {
        void fetchCategories();
      }
    }, 0);
    return () => {
      isMounted = false;
      window.clearTimeout(timer);
    };
  }, [fetchCategories]);

  const openCreateModal = () => {
    setEditingCategory(null);
    setFormData({
      name: "",
      slug: "",
      display_order: (categories.length + 1) * 10,
      is_active: true,
    });
    setIsModalOpen(true);
  };

  const openEditModal = (cat: DbMenuCategory) => {
    setEditingCategory(cat);
    setFormData({
      name: cat.name,
      slug: cat.slug,
      display_order: cat.display_order,
      is_active: cat.is_active,
    });
    setIsModalOpen(true);
  };

  const handleNameChange = (name: string) => {
    setFormData((prev) => ({
      ...prev,
      name,
      // Auto-generate slug only when creating new category
      slug: editingCategory ? prev.slug : name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    }));
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.slug.trim()) {
      toast.error("Name and slug are required");
      return;
    }

    setSaving(true);
    try {
      if (editingCategory) {
        const res = await fetch(`/api/admin/categories/${editingCategory.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formData.name.trim(),
            slug: formData.slug.trim().toLowerCase(),
            display_order: Number(formData.display_order),
            is_active: formData.is_active,
          }),
        });

        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          throw new Error(data.error || "Failed to update category");
        }

        toast.success(`Category "${formData.name}" updated!`);
      } else {
        const res = await fetch("/api/admin/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            branch_id: defaultBranchId,
            name: formData.name.trim(),
            slug: formData.slug.trim().toLowerCase(),
            display_order: Number(formData.display_order),
            is_active: formData.is_active,
          }),
        });

        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          throw new Error(data.error || "Failed to create category");
        }

        toast.success(`Category "${formData.name}" created!`);
      }

      setIsModalOpen(false);
      await fetchCategories();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save category";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (cat: DbMenuCategory) => {
    try {
      const newStatus = !cat.is_active;
      const res = await fetch(`/api/admin/categories/${cat.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: newStatus }),
      });

      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Failed to toggle status");
      }

      setCategories((prev) =>
        prev.map((c) => (c.id === cat.id ? { ...c, is_active: newStatus } : c))
      );
      toast.success(`${cat.name} is now ${newStatus ? "active" : "hidden"}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to toggle status";
      toast.error(msg);
    }
  };

  const confirmDelete = async (cat: DbMenuCategory) => {
    setDeletingCategory(cat);
    setItemCountForCategory(null);

    // Check count of menu items in this category
    const supabase = getSupabaseClient();
    if (supabase) {
      const { count } = await supabase
        .from("menu_items")
        .select("id", { count: "exact", head: true })
        .eq("category_id", cat.id);
      setItemCountForCategory(count ?? 0);
    }
  };

  const executeHardDelete = async () => {
    if (!deletingCategory) return;
    setSaving(true);

    try {
      const res = await fetch(`/api/admin/categories/${deletingCategory.id}`, {
        method: "DELETE",
      });

      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete category");
      }

      toast.success(`Category "${deletingCategory.name}" deleted.`);
      setDeletingCategory(null);
      await fetchCategories();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete category";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Menu Categories</h1>
          <p className="text-stone-400 text-sm mt-0.5">
            Organize customer menu sections, change display ordering, and control visibility
          </p>
        </div>
        <Button
          onClick={openCreateModal}
          className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold shadow-md"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Category
        </Button>
      </div>

      {/* Category List Table */}
      <div className="bg-stone-900/90 border border-stone-800 rounded-2xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-stone-400 space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
            <p className="text-sm">Loading categories from Supabase...</p>
          </div>
        ) : categories.length === 0 ? (
          <div className="py-16 text-center text-stone-400 space-y-3">
            <p className="text-base font-medium text-stone-300">No categories found</p>
            <p className="text-xs text-stone-500 max-w-sm mx-auto">
              Create your first menu category to start organizing items for your guests.
            </p>
            <Button onClick={openCreateModal} variant="outline" className="border-stone-700 text-stone-200">
              Create First Category
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-stone-300">
              <thead className="bg-stone-850/80 text-stone-400 text-xs uppercase tracking-wider border-b border-stone-800">
                <tr>
                  <th className="px-6 py-4 font-semibold">Order</th>
                  <th className="px-6 py-4 font-semibold">Name</th>
                  <th className="px-6 py-4 font-semibold">Slug</th>
                  <th className="px-6 py-4 font-semibold text-center">Status</th>
                  <th className="px-6 py-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-800/80 font-normal">
                {categories.map((cat) => (
                  <tr key={cat.id} className="hover:bg-stone-850/40 transition-colors">
                    <td className="px-6 py-4 font-mono text-xs text-stone-400">
                      <span className="bg-stone-800 px-2.5 py-1 rounded-md">{cat.display_order}</span>
                    </td>
                    <td className="px-6 py-4 font-semibold text-white">{cat.name}</td>
                    <td className="px-6 py-4 font-mono text-xs text-amber-400/90">{cat.slug}</td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => toggleActive(cat)}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                          cat.is_active
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20"
                            : "bg-stone-800 text-stone-400 border border-stone-700 hover:bg-stone-750"
                        }`}
                      >
                        {cat.is_active ? "Active" : "Hidden"}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditModal(cat)}
                        className="text-stone-400 hover:text-white hover:bg-stone-800"
                      >
                        <Edit2 className="w-3.5 h-3.5 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => confirmDelete(cat)}
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" />
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Category Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-stone-800 pb-4">
              <h2 className="text-lg font-bold text-white">
                {editingCategory ? "Edit Category" : "Create New Category"}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-stone-400 hover:text-white rounded-lg p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCategory} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-stone-300">
                  Category Name
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="e.g. Specialty Coffees"
                  className="w-full px-3.5 py-2.5 bg-stone-800 border border-stone-700 rounded-xl text-stone-100 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-stone-300">
                  URL Slug
                </label>
                <input
                  type="text"
                  required
                  value={formData.slug}
                  onChange={(e) => setFormData((p) => ({ ...p, slug: e.target.value }))}
                  placeholder="specialty-coffees"
                  className="w-full px-3.5 py-2.5 bg-stone-800 border border-stone-700 rounded-xl font-mono text-xs text-amber-400 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-stone-300">
                    Display Order
                  </label>
                  <input
                    type="number"
                    value={formData.display_order}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, display_order: parseInt(e.target.value) || 0 }))
                    }
                    className="w-full px-3.5 py-2.5 bg-stone-800 border border-stone-700 rounded-xl text-stone-100 text-sm"
                  />
                </div>

                <div className="space-y-1.5 flex flex-col justify-end">
                  <label className="flex items-center gap-2 cursor-pointer pb-2.5">
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={(e) => setFormData((p) => ({ ...p, is_active: e.target.checked }))}
                      className="rounded border-stone-700 text-amber-500 focus:ring-amber-500 w-4 h-4 bg-stone-800"
                    />
                    <span className="text-sm font-medium text-stone-200">Active (Visible)</span>
                  </label>
                </div>
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
                  disabled={saving}
                  className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  {editingCategory ? "Save Changes" : "Create Category"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingCategory && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl animate-in zoom-in-95">
            <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center space-y-2">
              <h2 className="text-lg font-bold text-white">
                {itemCountForCategory && itemCountForCategory > 0
                  ? "Cannot Delete Category"
                  : "Permanently Delete Category?"}
              </h2>
              <p className="text-stone-400 text-sm">
                Category: <strong className="text-white">{deletingCategory.name}</strong>
              </p>
              {itemCountForCategory !== null && itemCountForCategory > 0 ? (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl text-xs text-left space-y-1">
                  <p className="font-semibold">⚠️ Deletion Blocked</p>
                  <p>
                    This category currently has <strong>{itemCountForCategory}</strong> menu item(s) assigned to it.
                    To preserve data integrity, you must reassign or delete these items before deleting this category.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-stone-500">
                  This category has no assigned menu items and can be safely removed.
                </p>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setDeletingCategory(null)}
                className="border-stone-700 text-stone-300 hover:bg-stone-800"
              >
                {itemCountForCategory && itemCountForCategory > 0 ? "Close" : "Cancel"}
              </Button>
              <Button
                variant="destructive"
                onClick={executeHardDelete}
                disabled={saving || Boolean(itemCountForCategory && itemCountForCategory > 0)}
                className="bg-red-600 hover:bg-red-500 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {itemCountForCategory && itemCountForCategory > 0 ? "Deletion Blocked" : "Confirm Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
