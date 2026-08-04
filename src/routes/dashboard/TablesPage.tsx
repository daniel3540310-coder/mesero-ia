import { useEffect, useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { jsPDF } from "jspdf";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../contexts/AuthContext";
import type { RestaurantTable } from "../../types/database";

function tableUrl(qrToken: string) {
  return `${window.location.origin}/menu/${qrToken}`;
}

export function TablesPage() {
  const { restaurant } = useAuth();
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const qrContainerRefs = useRef<Record<string, HTMLDivElement | null>>({});

  async function load() {
    if (!restaurant) return;
    const { data } = await supabase
      .from("tables")
      .select("*")
      .eq("restaurant_id", restaurant.id)
      .order("label");
    setTables((data as RestaurantTable[]) ?? []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant?.id]);

  async function addTable() {
    if (!restaurant || !newLabel.trim()) return;
    await supabase.from("tables").insert({
      restaurant_id: restaurant.id,
      label: newLabel.trim(),
    });
    setNewLabel("");
    await load();
  }

  async function removeTable(id: string) {
    if (!confirm("¿Eliminar esta mesa? El QR impreso dejará de funcionar.")) return;
    await supabase.from("tables").delete().eq("id", id);
    await load();
  }

  async function downloadPdf() {
    setGeneratingPdf(true);
    try {
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const perRow = 2;
      const cellWidth = 90;
      const cellHeight = 100;
      let x = 15;
      let y = 15;

      tables.forEach((table, index) => {
        const canvas = qrContainerRefs.current[table.id]?.querySelector("canvas");
        if (canvas) {
          const dataUrl = canvas.toDataURL("image/png");
          doc.addImage(dataUrl, "PNG", x, y, 70, 70);
          doc.text(table.label, x + 35, y + 78, { align: "center" });
        }

        if ((index + 1) % perRow === 0) {
          x = 15;
          y += cellHeight;
        } else {
          x += cellWidth;
        }

        if (y > 250 && (index + 1) % (perRow * 2) === 0) {
          doc.addPage();
          x = 15;
          y = 15;
        }
      });

      doc.save(`${restaurant?.slug ?? "mesas"}-qr.pdf`);
    } finally {
      setGeneratingPdf(false);
    }
  }

  if (!restaurant) return null;

  return (
    <div>
      <h2 className="mb-1 text-xl font-semibold">Mesas</h2>
      <p className="mb-4 text-sm text-neutral-500">
        Cada mesa tiene un QR único. El cliente lo escanea y el sistema identifica
        automáticamente el restaurante y la mesa.
      </p>

      <div className="mb-4 flex gap-2">
        <input
          className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          placeholder="Ej. Mesa 7"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTable()}
        />
        <button
          onClick={addTable}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Agregar mesa
        </button>
        {tables.length > 0 && (
          <button
            onClick={downloadPdf}
            disabled={generatingPdf}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100 disabled:opacity-60"
          >
            {generatingPdf ? "Generando…" : "Descargar PDF"}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {tables.map((table) => (
          <div
            key={table.id}
            className="flex flex-col items-center gap-2 rounded-xl border border-neutral-200 bg-white p-4"
          >
            <div
              ref={(el) => {
                qrContainerRefs.current[table.id] = el;
              }}
            >
              <QRCodeCanvas value={tableUrl(table.qr_token)} size={140} />
            </div>
            <p className="font-medium">{table.label}</p>
            <button
              onClick={() => removeTable(table.id)}
              className="text-xs text-red-600 hover:underline"
            >
              Eliminar
            </button>
          </div>
        ))}
      </div>
      {tables.length === 0 && (
        <p className="text-neutral-500">Aún no has creado mesas.</p>
      )}
    </div>
  );
}
