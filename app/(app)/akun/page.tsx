import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

import { FormNama, FormSandi } from "./FormAkun";

export const metadata = { title: "Akun — KDS Terpadu" };

const waktuWib = (d: Date) =>
  new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);

export default async function AkunPage() {
  const sesi = await auth();
  const user = sesi?.user?.id ? await prisma.user.findUnique({ where: { id: sesi.user.id }, select: { nama: true, email: true, sandiDiubahPada: true } }) : null;
  if (!user) return <p className="text-sm text-slate-600">Sesi login sudah habis, silakan masuk ulang.</p>;
  return (
    <div className="max-w-xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Akun</h1>
        <p className="text-sm text-slate-500">
          {user.email}
          {user.sandiDiubahPada ? ` · kata sandi terakhir diganti ${waktuWib(user.sandiDiubahPada)} WIB` : " · kata sandi belum pernah diganti dari aplikasi"}
        </p>
      </div>
      <FormNama namaAwal={user.nama} />
      <FormSandi />
      <p className="text-xs text-slate-500">
        Akun dikunci 15 menit setelah 5 kali salah memasukkan kata sandi. Lupa kata sandi: pemilik server menjalankan <code>npm run admin:reset-sandi</code>.
      </p>
    </div>
  );
}
