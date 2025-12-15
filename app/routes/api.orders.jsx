import { authenticate } from "../shopify.server";
import { getOrCreateShop } from "../lib/db.server";
import { prisma } from "../lib/db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken);

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = parseInt(url.searchParams.get("limit") || "20");
  const search = url.searchParams.get("search") || "";
  const status = url.searchParams.get("status") || "";

  const skip = (page - 1) * limit;

  try {
    // Build where clause
    const where = {
      shopId: shop.id,
      ...(search && {
        OR: [
          { customerName: { contains: search, mode: "insensitive" } },
          { customerEmail: { contains: search, mode: "insensitive" } },
          { customerPhone: { contains: search, mode: "insensitive" } },
        ],
      }),
      ...(status && { status }),
    };

    // Get orders with pagination
    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.order.count({ where }),
    ]);

    return Response.json({
      success: true,
      orders: orders.map(order => ({
        ...order,
        items: JSON.parse(order.items),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching orders:", error);
    return Response.json(
      { success: false, error: "Failed to fetch orders" },
      { status: 500 }
    );
  }
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken);

  try {
    const { orderId, status } = await request.json();

    if (!orderId || !status) {
      return Response.json(
        { success: false, error: "Order ID and status are required" },
        { status: 400 }
      );
    }

    // Update order status
    const order = await prisma.order.update({
      where: {
        id: orderId,
        shopId: shop.id,
      },
      data: {
        status,
        updatedAt: new Date(),
      },
    });

    return Response.json({
      success: true,
      order: {
        ...order,
        items: JSON.parse(order.items),
      },
    });
  } catch (error) {
    console.error("Error updating order:", error);
    return Response.json(
      { success: false, error: "Failed to update order" },
      { status: 500 }
    );
  }
};
