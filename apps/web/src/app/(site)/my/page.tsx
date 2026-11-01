import { MyAccountNote, MyBooks } from "@/components/my-books";
import { MyOrders } from "@/components/my-orders";
import { T } from "@/components/t";

export default function MyBooksPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
      <h1 className="text-3xl font-extrabold">
        <T k="my.title" />
      </h1>
      <MyAccountNote />
      <MyBooks />
      <MyOrders />
    </main>
  );
}
