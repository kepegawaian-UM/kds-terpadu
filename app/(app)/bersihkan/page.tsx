import { BersihkanBerkas } from "@/components/simpega/BersihkanBerkas";
import { KepalaHalaman } from "@/components/laporan/KepalaHalaman";

export default function BersihkanPage() {
  return (
    <div className="space-y-5">
      <KepalaHalaman judul="Bersihkan Berkas SIMPEGA" />
      <BersihkanBerkas />
    </div>
  );
}
