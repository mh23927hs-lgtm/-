# Security Specification — ZAD MAHAWI (زاد مهاوي)

## 1. Data Invariants & Master Source of Truth
1. **Store Catalog (`categories`, `products`, `banners`, `offers`, `delivery_zones`, `settings/store`, `settings/payments`, `media`)**:
   - Publicly readable for storefront browsing without login.
   - Strictly writable only by verified, active staff with the matching permission (`manageCategories`, `manageProducts`, `manageHome`, `manageOffers`, `manageDelivery`, `manageSettings`, `managePayments`), or the Store Owner (`mh23927hs@gmail.com` or role `owner`).
   - Cost prices (`product_costs/{productId}`) are isolated from `products` so customers cannot read wholesale/cost margins.
2. **Customer PII & Addresses (`users/{userId}`, `users/{userId}/addresses/{addressId}`)**:
   - Strictly readable and writable only by the verified account owner (`request.auth.uid == userId`) or authorized staff (`manageCustomers`).
   - Customers cannot modify `ordersCount`, `totalSpent`, or `uid`.
3. **Orders (`orders/{orderId}`)**:
   - Creation requires verified authentication (`request.auth.token.email_verified == true`), `customerId == request.auth.uid`, `status == 'new'`, `paymentStatus == 'pending'`, non-negative verified numbers, bounded `items` list, and `createdAt == request.time`.
   - Customers can only read/list their own orders (`resource.data.customerId == request.auth.uid`).
   - Customers cannot change order `status` (except cancelling while `status == 'new'` via dedicated action check) or fake `paymentStatus == 'paid'`.
   - Staff with `manageOrders` can transition order statuses and payment states.
4. **RBAC (`staff_invites/{email}`) & Audit Logs (`audit_logs/{logId}`)**:
   - Only the Store Owner (`owner` role or bootstrapped owner email) can create, update, or delete `staff_invites`.
   - Staff members can read only their own `staff_invites/{request.auth.token.email}` record.
   - `audit_logs` are append-only (`create` by active staff with `actorUid == request.auth.uid`, immutable `update`/`delete` forbidden).
5. **Notifications (`notifications/{notificationId}`) & FCM Tokens (`fcm_tokens/{tokenId}`)**:
   - Users can read notifications targeted to their `targetUserId == request.auth.uid` or `targetType == 'broadcast'`, and mark only `isRead` on their own notifications.
   - Staff can read `targetType == 'admin'` notifications and create user/broadcast notifications.
   - Users can manage only their own `fcm_tokens` where `userId == request.auth.uid`.

## 2. The "Dirty Dozen" Attack Payloads (All Must Result in `PERMISSION_DENIED`)
1. **Unverified Email Admin Spoof**: `request.auth.token.email = "mh23927hs@gmail.com"`, `email_verified = false` writing to `/products/p1`.
2. **Shadow Field Injection on Product**: Staff payload on `/products/p1` with extra ghost field `isHacked: true`.
3. **Customer Self-Privilege Escalation**: Customer writing `/staff_invites/attacker@gmail.com` with `{ role: "owner", isActive: true }`.
4. **Order Price/Payment Forgery**: Customer creating `/orders/o1` with `paymentStatus: "paid"` or `status: "delivered"`.
5. **Cross-Tenant Order Read**: Customer A listing or reading `/orders/o2` belonging to Customer B (`customerId != auth.uid`).
6. **PII Leak on Users**: Customer A attempting `get(/users/customerB)`.
7. **Product Cost Leak**: Unauthenticated or customer user attempting `get(/product_costs/p1)`.
8. **Audit Log Tampering**: Staff member attempting `update` or `delete` on `/audit_logs/log1`.
9. **Customer Stat Tampering**: Customer updating `/users/{uid}` with `totalSpent: 999999` or `ordersCount: 500`.
10. **ID Poisoning / Resource Exhaustion**: Writing `/categories/` with a 500-char ID or 100KB `name`.
11. **Timestamp Forgery**: Creating `/orders/o1` with a past/future `createdAt` (`createdAt != request.time`).
12. **Terminal State Bypass**: Customer updating `/orders/o1` after `status == 'delivered'` or `status == 'cancelled'`.
