import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getOrCreateShop, getOrders } from "../lib/db.server";
import OrdersTable from "../components/OrdersTable";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken);

  // Get orders with pagination
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const status = url.searchParams.get("status") || undefined;
  const search = url.searchParams.get("search") || undefined;

  const ordersData = await getOrders(shop.id, {
    page,
    limit: 20,
    status,
    search,
  });

  return {
    orders: ordersData.orders,
    pagination: {
      page: ordersData.page,
      total: ordersData.total,
      totalPages: ordersData.pages,
    },
    filters: { status, search },
  };
};

export default function Orders() {
  const data = useLoaderData();

  return (
    <s-page heading="COD Orders">
      <s-section>
        <s-stack direction="block" gap="base">
          <OrdersTable
            orders={data.orders}
            pagination={data.pagination}
            filters={data.filters}
          />
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
