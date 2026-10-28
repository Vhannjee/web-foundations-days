# TicketHub Design Document

TicketHub is a website that sells tickets for concerts and events. This document follows the framework from the course: requirements, estimates, API, data model, architecture, and trade-offs. It also explains in detail how the design stops two people buying the same seat.

## 1. Context, goals and non-goals

**Context.** TicketHub has 2 million registered users. On a normal day it is quiet. But when a very popular concert goes on sale, 200,000 people try to buy 20,000 seats in the first 10 minutes. The design has to work on both kinds of day.

**Goals**

- Let people browse events, pick seats, pay and get their tickets.
- Never sell the same seat twice.
- Stay online and fair during a big sale.

**Non-goals** (things I deliberately do not design, so the project stays small)

- Refunds, cancellations and ticket resale.
- Recommendations, reviews and event organiser tools.
- Building our own payment system. We use an outside payment provider, and we never store card numbers.

## 2. Requirements

### Functional requirements

- Users can register and log in.
- Users can browse and search events (by name, city and date).
- Users can open an event and see its seat map with which seats are available.
- Users can pick seats (at most 4 per event) and **hold** them for 10 minutes while they pay.
- Users can pay for held seats and receive their tickets.
- Users can see all their tickets.
- Held seats that are not paid for are released automatically when the hold expires.

### Non-functional requirements

- **Speed:** browsing pages and the seat map should load in under 1 second. Holding seats should answer in under 2 seconds, even during a big sale.
- **Correctness:** a seat must **never** be sold to two people. A user must never pay and end up with no ticket, and must never be charged twice. This matters more than speed.
- **Fairness:** the first people to arrive should get the first chance. One person should not be able to grab hundreds of seats with bots. Everyone gets a clear answer ("you got it" or "sold out") and nobody just sees an error page.
- **Availability:** the site must stay up during the big sale (aim for 99.9%), and it must slow down gracefully instead of crashing.
- **Durability:** a paid order must never be lost.
- **Security:** HTTPS everywhere, hashed passwords, and card details handled only by the payment provider.
- **Consistency:** seat ownership needs to be exactly right (strong consistency). Browsing data, like event descriptions, can be a few seconds old.

## 3. Estimates

I use 86,400 seconds in a day, and I assume the **peak is 5 times the average** (the same rule as in the course).

### Normal day

- Page views: 50,000 visitors x 10 pages = 500,000 views per day.
- Average: 500,000 / 86,400 = about **6 page views per second**.
- Peak: 6 x 5 = about **29 per second**.
- Tickets sold: 5,000 per day / 86,400 = about **0.06 tickets per second** (about one ticket every 17 seconds). Peak is about 0.3 per second.
- Storage: about 1 KB per ticket and order, so 5,000 x 1 KB = 5 MB per day, or about **2 GB per year**. The 20,000 seat rows for one big event take only about 2 MB.

This is very small. One server and one database could handle a normal day.

### Big sale (first 10 minutes = 600 seconds)

My assumptions:

- All 200,000 people show up, and each sends about **10 requests** in the 10 minutes (open the event page, refresh the seat map a few times, try to hold seats, pay).
- On average each person tries to hold seats **2 times**, because the first choice is often already taken.
- Half the people arrive in the first minute, so the arrival peak is about 5 times the average.

| Measure | Working out | Result |
| --- | --- | --- |
| People arriving per second (average) | 200,000 / 600 | about 333 per second |
| People arriving per second (peak) | 333 x 5 | about 1,700 per second |
| Requests per second (average) | 200,000 x 10 / 600 | about **3,300 per second** |
| Requests per second (peak) | 3,300 x 5 | about **16,700 per second** |
| Hold attempts per second (average) | 200,000 x 2 / 600 | about **670 per second** |
| Hold attempts per second (peak) | 670 x 5 | about **3,300 per second** |
| Tickets sold per second (average) | 20,000 / 600 | about **33 per second** |
| Tickets sold per second if sold out in 2 minutes | 20,000 / 120 | about **167 per second** |
| People per seat | 200,000 / 20,000 | **10 people for every seat** |

### Comparing the two

| Measure | Normal day | Big sale | How much bigger |
| --- | --- | --- | --- |
| Requests per second (average) | 6 | 3,300 | about 575 times |
| Requests per second (peak) | 29 | 16,700 | about 575 times |
| Tickets sold per second | 0.06 | 33 | about 575 times |

What I learned from the numbers:

1. **The big sale is about 575 times busier than a normal day.** A system built only for a normal day would crash. But it is only like that for a few minutes, so it would be a waste to pay for that much hardware all month. That is why we need to add capacity only for the sale, and use a waiting room.
2. **The hard part is not the total traffic, it is the competition.** 3,300 hold attempts per second all fight over the same 20,000 seats. Many of them want the *same* seats (the good ones). That is the exact situation where double-booking bugs happen.
3. **90% of people will not get a ticket** (180,000 of 200,000). So the experience for people who lose matters too: a quick "sold out" is much better than a spinning page.
4. **Reads and writes are different.** Most requests only look at the seat map (reads), and they can be cached. Only the hold and pay steps (writes) must go to the main database.

## 4. API

The API uses plural nouns, the HTTP method as the action, JSON, and a token (`Authorization: Bearer ...`) for every request except register and login. Base URL: `https://api.tickethub.example/v1`.

| # | Method | Path | Description | Success status |
| --- | --- | --- | --- | --- |
| 1 | POST | `/users` | Register | 201 Created |
| 2 | POST | `/auth/login` | Log in and get a token | 200 OK |
| 3 | GET | `/events` | Browse events (`?q=`, `?city=`, `?date=`, `?page=`) | 200 OK |
| 4 | GET | `/events/{id}` | Details of one event | 200 OK |
| 5 | GET | `/events/{id}/seats` | The seat map with availability (`?section=`) | 200 OK |
| 6 | POST | `/events/{id}/holds` | Hold seats for 10 minutes | 201 Created |
| 7 | DELETE | `/holds/{holdId}` | Give up a hold and release the seats | 204 No Content |
| 8 | POST | `/orders` | Pay for a hold and create the order | 201 Created |
| 9 | GET | `/orders/{id}` | See one order and its status | 200 OK |
| 10 | GET | `/me/tickets` | See all my tickets | 200 OK |

### Example: view seats (`GET /events/42/seats?section=A`)

Other people's holds and sales both show as `unavailable`, because the user doesn't need to know which.

```json
{
  "eventId": 42,
  "generatedAt": "2026-11-20T18:00:03Z",
  "seats": [
    { "id": 1001, "section": "A", "row": "1", "number": 1, "priceCents": 8500, "status": "available" },
    { "id": 1002, "section": "A", "row": "1", "number": 2, "priceCents": 8500, "status": "unavailable" }
  ]
}
```

The `generatedAt` time shows the client that this data can be a few seconds old (it comes from the cache).

### Example: hold seats (`POST /events/42/holds`)

```json
{ "seatIds": [1001, 1003] }
```

**Success: `201 Created`**

```json
{
  "holdId": 9001,
  "eventId": 42,
  "seatIds": [1001, 1003],
  "expiresAt": "2026-11-20T18:10:05Z"
}
```

**Failure: `409 Conflict`** (someone else got there first; **none** of the seats is held)

```json
{
  "error": {
    "status": 409,
    "code": "SEAT_TAKEN",
    "message": "One or more seats were just taken. Please choose different seats.",
    "unavailableSeatIds": [1003]
  }
}
```

### Example: pay (`POST /orders`)

The client sends a unique `Idempotency-Key` header (for example a random id made when the page opens). If the request is sent twice, because of a double click or a retry after a bad connection, the server sees the same key and does not charge twice.

```json
{ "holdId": 9001, "paymentToken": "tok_abc123" }
```

**Success: `201 Created`**

```json
{
  "orderId": 7001,
  "status": "paid",
  "totalCents": 17000,
  "tickets": [
    { "id": 5001, "seatId": 1001, "code": "T7001-1001" },
    { "id": 5002, "seatId": 1003, "code": "T7001-1003" }
  ]
}
```

### Error codes

| Status | When it happens |
| --- | --- |
| 400 Bad Request | Wrong input, for example no seats chosen, or more than 4 seats |
| 401 Unauthorized | Not logged in, or the token expired |
| 402 Payment Required | The payment provider refused the card (the hold stays so the user can try another card) |
| 403 Forbidden | Trying to use someone else's hold or order |
| 404 Not Found | The event, hold or order does not exist |
| 409 Conflict | A seat is already held or sold by someone else |
| 410 Gone | The hold has expired, so the seats were released |
| 429 Too Many Requests | The user or IP sent too many requests (rate limit); includes a `Retry-After` header |
| 503 Service Unavailable | The system is overloaded or in maintenance; try again later |

## 5. Data model

There are six tables.

- **users:** the people who buy tickets.
- **events:** the concerts (name, venue, start time, when sales open, ticket limit per person).
- **seats:** one row per seat for each event, with its price and its **status** (`available`, `held` or `sold`).
- **holds:** a temporary reservation of 1 to 4 seats by one user, with an expiry time.
- **orders:** a purchase, linked to the hold it is paying for.
- **tickets:** one row per seat that was really sold.

### Relationships

- **users to orders: one-to-many.** One user makes many orders. The same is true for users to holds.
- **events to seats: one-to-many.** One event has thousands of seats, and each seat belongs to one event.
- **holds to seats: one-to-many.** One hold covers up to 4 seats (`seats.hold_id`).
- **orders to holds: one-to-one.** An order pays for exactly one hold, and a hold can only be paid once (`orders.hold_id` is UNIQUE).
- **orders to tickets: one-to-many.** One order produces one ticket per seat.
- **seats to tickets: one-to-at-most-one.** A seat can have **at most one** ticket (`tickets.seat_id` is UNIQUE). This rule is the final protection against double-booking.
- **users and seats:** a user can buy many seats, but each seat is sold to at most one user. So I connect them through `orders` and `tickets` and don't need a separate join table.

### CREATE TABLE statements

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id             INTEGER PRIMARY KEY,
  name           TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE events (
  id                    INTEGER PRIMARY KEY,
  name                  TEXT NOT NULL,
  venue                 TEXT NOT NULL,
  starts_at             TEXT NOT NULL,
  on_sale_at            TEXT NOT NULL,
  max_tickets_per_user  INTEGER NOT NULL DEFAULT 4
);

CREATE TABLE holds (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  event_id    INTEGER NOT NULL REFERENCES events(id),
  seat_count  INTEGER NOT NULL CHECK (seat_count BETWEEN 1 AND 4),
  status      TEXT NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'converted', 'released')),
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at  TEXT NOT NULL
);

CREATE TABLE seats (
  id               INTEGER PRIMARY KEY,
  event_id         INTEGER NOT NULL REFERENCES events(id),
  section          TEXT NOT NULL,
  row_label        TEXT NOT NULL,
  seat_number      INTEGER NOT NULL,
  price_cents      INTEGER NOT NULL CHECK (price_cents >= 0),
  status           TEXT NOT NULL DEFAULT 'available'
                   CHECK (status IN ('available', 'held', 'sold')),
  hold_id          INTEGER REFERENCES holds(id),
  hold_expires_at  TEXT,
  UNIQUE (event_id, section, row_label, seat_number)
);

CREATE TABLE orders (
  id               INTEGER PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id),
  event_id         INTEGER NOT NULL REFERENCES events(id),
  hold_id          INTEGER NOT NULL UNIQUE REFERENCES holds(id),
  total_cents      INTEGER NOT NULL CHECK (total_cents >= 0),
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'paid', 'failed')),
  idempotency_key  TEXT NOT NULL UNIQUE,
  payment_ref      TEXT UNIQUE,
  created_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tickets (
  id        INTEGER PRIMARY KEY,
  order_id  INTEGER NOT NULL REFERENCES orders(id),
  seat_id   INTEGER NOT NULL UNIQUE REFERENCES seats(id),   -- one seat, one ticket: the last line of defence
  code      TEXT NOT NULL UNIQUE
);

CREATE INDEX idx_seats_event_status ON seats(event_id, status);
CREATE INDEX idx_holds_expires      ON holds(expires_at);
CREATE INDEX idx_orders_user        ON orders(user_id);
CREATE INDEX idx_tickets_order      ON tickets(order_id);
```

I added indexes for the common queries: `seats(event_id, status)` for the seat map and for finding free seats, `holds(expires_at)` so a worker can find expired holds quickly, `orders(user_id)` and `tickets(order_id)` for "my tickets". The `UNIQUE` columns get their own indexes automatically.

I put `hold_expires_at` on the seat row as well as on the hold. This repeats data on purpose: it lets the single `UPDATE` that grabs seats check "is this old hold expired?" without needing a join.

I chose **SQL** (for example PostgreSQL) because seat selling needs transactions and constraints. A document database could be faster to scale, but it makes "all or nothing" changes over several seats and "this value must be unique" rules much harder.

## 6. How the design prevents two people buying the same seat

This is the most important part of the design. The rule is: **the database, not the app code, decides who gets a seat, and it makes that decision in one atomic step.** I use four layers.

### The bug we must avoid: "check, then update"

The obvious way to write a hold is: (1) `SELECT` to see if the seat is available, (2) if yes, `UPDATE` it to held. This has a **race condition**, because two people can do step 1 at nearly the same moment:

| Time | Person A | Person B |
| --- | --- | --- |
| 1 | SELECT seat 7: "available" | |
| 2 | | SELECT seat 7: "available" |
| 3 | UPDATE seat 7 to held (A) | |
| 4 | | UPDATE seat 7 to held (B), overwriting A |

Both think they got the seat. The problem is the gap between checking and changing. The fix is to make the check and the change **one statement**.

### Layer 1: one conditional UPDATE inside a transaction (holding)

```sql
BEGIN;

INSERT INTO holds (user_id, event_id, seat_count, expires_at)
VALUES (:user_id, :event_id, 2, datetime('now', '+10 minutes'));

UPDATE seats
SET status = 'held',
    hold_id = last_insert_rowid(),
    hold_expires_at = datetime('now', '+10 minutes')
WHERE event_id = :event_id
  AND id IN (:seat1, :seat2)
  AND (status = 'available'
       OR (status = 'held' AND hold_expires_at < datetime('now')));

-- The app now looks at how many seats the UPDATE changed.
-- Same as the number asked for?  COMMIT.   Fewer?  ROLLBACK and reply 409.
```

- The `WHERE` clause contains the check (`status = 'available'`), so checking and changing happen together in one statement.
- When two people update the same row at the same time, the database **locks the row** for the first one. The second one has to wait, and when it continues it checks the `WHERE` condition again. The seat is now held, so the condition is false and **0 rows change** for the second person.
- The app compares the number of rows changed with the number of seats requested. If it is smaller, it does `ROLLBACK`, so it is **all or nothing**: if you ask for seats 2 and 3 and seat 2 is taken, you do not end up holding seat 3 alone. The user gets `409 Conflict` and picks again.
- Holds expire by themselves: the condition also allows a seat that is `held` with an expiry time in the past. So correctness does not depend on a cleanup job running on time. A worker also tidies up expired holds, but that is only for neatness.
- To avoid two multi-seat transactions waiting on each other forever (a deadlock), the app sorts the seat ids before updating, and retries once if the database reports a deadlock.

### Layer 2: the sale is also one transaction (paying)

```sql
BEGIN;

-- 1. The hold must be mine, still active and not expired (must change exactly 1 row)
UPDATE holds SET status = 'converted'
WHERE id = :hold_id AND user_id = :user_id
  AND status = 'active' AND expires_at > datetime('now');

-- 2. Turn the held seats into sold seats.
--    The number of changed rows must equal holds.seat_count, otherwise ROLLBACK.
UPDATE seats SET status = 'sold'
WHERE hold_id = :hold_id AND status = 'held';

-- 3. Mark the order as paid and create one ticket per seat
UPDATE orders SET status = 'paid', payment_ref = :payment_ref WHERE id = :order_id;

INSERT INTO tickets (order_id, seat_id, code)
SELECT :order_id, id, 'T' || :order_id || '-' || id
FROM seats WHERE hold_id = :hold_id;

COMMIT;
```

- Step 1 only works if the hold belongs to this user, is `active` and has **not expired**. If it changed 0 rows, the app rolls back and answers `410 Gone`.
- Step 2 must change exactly as many seats as `holds.seat_count`. If someone else's hold has reclaimed one of the seats, the numbers do not match, the transaction is rolled back, and nothing is sold.
- The order, the seat status and the tickets are all saved in the same transaction, so we never get "paid but no ticket".

### Layer 3: a UNIQUE constraint as the last line of defence

`tickets.seat_id` is `UNIQUE`. Even if there was a bug in my code, the database would still **refuse** to create a second ticket for the same seat, and the transaction would fail instead of selling it twice. Code can have bugs; a constraint always applies.

### Layer 4: paying safely

The payment provider is outside our database, so a card can be charged and then our server crashes before it saves the ticket. To handle this:

1. `POST /orders` first creates the order as `pending` (with the unique `Idempotency-Key`) and **extends the hold by 2 minutes**, so it cannot expire in the middle of paying.
2. The server charges the card through the payment provider, using the same idempotency key, so a retry can never charge twice.
3. If the charge works, the sale transaction above runs. If it fails, the order becomes `failed` and the hold stays active so the user can try another card.
4. A **worker** regularly checks old `pending` orders with the payment provider. If a card was charged but no ticket was made, it finishes the sale (or refunds the money if the seats are gone).

### What I tested

I built these tables in SQLite and ran the statements above:

- User A holds seats 1 and 2. User B then asks for seats 2 and 3 and is refused, and seat 3 is **still available** (all or nothing).
- After A's hold expires, B can hold seat 2. A's attempt to pay with the old hold is refused.
- Once B pays, a third user cannot hold seat 2, and inserting a second ticket for seat 2 directly is rejected by the `UNIQUE` constraint.
- A sale is refused if one of the hold's seats was taken by someone else, and no tickets are created.
- **100 buyers tried to hold the same 3 seats at the same moment: exactly 1 won and 99 were refused.**

## 7. Architecture

```
                      +-----------------------+
                      |         Client        |
                      | (browser / phone app) |
                      +-----------------------+
                                  |
        +-------------------------+-------------------------+
        v                         v                         v
 +------------+          +----------------+         +--------------+
 |    DNS     |          |  Waiting Room  |         |     CDN      |
 |(name to IP)|          +----------------+         |(static files)|
 +------------+                   v                 +--------------+
                         +-----------------+
                         |  Load Balancer  |
                         | (rate limiting) |
                         +-----------------+
                                  |
                      +-----------+-------+
                      v                   v              +------------+
              +--------------+        +--------------+   |  Payment   |
              | App Server 1 |        | App Server 2 |-->|  Provider  |
              +--------------+        +--------------+   +------------+
                      |                   |
      +---------------+---+---------------+---+-------------------+
      v                   v                   v                   v
+------------+     +--------------+   +--------------+     +--------------+
|   Cache    |     |  Primary DB  |   | Read Replica |     |    Queue     |
|  (Redis)   |     | (all writes) |-->|  (browsing)  |     |    (jobs)    |
+------------+     +--------------+   +--------------+     +--------------+
                                                                  |
                                                                  v
                                                           +--------------+
                                                           |    Worker    |
                                                           +--------------+
```

How to read it: the client looks up the address with **DNS**, and loads the page files from the **CDN**. API requests first pass through the **waiting room** (during a big sale), then the **load balancer**, then one of the **app servers**. The app servers use the **cache**, the **primary database** (all writes and the booking decisions), the **read replica** (browsing), the **queue** (slow jobs) and the **payment provider**. The primary copies its data to the replica (`-->`). **Workers** take jobs from the queue and also use the database and the payment provider.

### What each component does

- **Client:** the browser or phone app where the user browses, picks seats and pays.
- **DNS:** it turns the name `tickethub.example` into the address of our servers, so users don't need to remember IP addresses.
- **CDN:** it solves the problem of 200,000 people loading the same images and files by keeping copies near the users, so our own servers don't have to send them.
- **Waiting room:** it solves the problem of 200,000 people hitting the system at the same second by letting people in at a steady rate, in a fair order, while everyone else sees a "you are in the queue" page.
- **Load balancer (with rate limiting):** it solves the problem of one server being overloaded by spreading requests across the app servers, and it blocks users or IP addresses that send far too many requests (such as bots).
- **App servers (two or more):** they run the API code (check the token, validate input, run the booking transactions), and because they keep no data of their own, we can add many more before a big sale.
- **Cache (Redis):** it solves the problem of thousands of people refreshing the seat map by keeping the seat map and event details in fast memory, so those reads do not touch the database.
- **Primary database:** it solves the problem of deciding who gets each seat by being the single trusted place where seats are held and sold, using transactions and constraints.
- **Read replica:** it solves read overload on the primary by serving browsing requests (events, "my tickets") from a copy, and it can take over if the primary fails.
- **Queue:** it solves slow work in the request path by letting the app server write down jobs (send confirmation email, make the ticket PDF, release expired holds) and reply to the user straight away.
- **Workers:** they solve the problem of doing slow jobs without slowing users down, by processing the queue in the background, and also by checking old pending payments.
- **Payment provider:** it solves the problem of handling card payments safely by taking the card details so we never store them.

### How the design survives the big sale

1. **Before the sale:** we add more app servers ahead of time (pre-warming), because it takes time to start them and the sale time is known in advance.
2. **The CDN** serves all the images and page files, so 200,000 visitors don't touch our servers for those.
3. **The waiting room** keeps the number of active shoppers at a level the database can handle. For example, letting in about 100 people per second means the primary sees a few hundred hold attempts per second instead of 3,300. People who get in later may find the event already sold out, but the system stays up and the order is fair.
4. **The cache** serves the seat map with a very short expiry (1 to 2 seconds), so thousands of people can look at it without touching the database. Changes to a seat remove its entry from the cache. The seat map can be slightly out of date, but that is safe: the hold step always checks the real data in the primary database.
5. **Only small transactions reach the primary.** A hold touches 1 to 4 rows, and the lock only lasts a few milliseconds. Browsing goes to the replica or cache.
6. **Rate limits and bot protection:** limits per user and per IP, a limit of 4 tickets per person, and a CAPTCHA at the waiting room.
7. **Slow jobs** (emails, PDFs) go through the queue and don't block the buying.
8. **Graceful overload:** if the system is still overloaded, it answers `429` or `503` with `Retry-After` instead of crashing, and the waiting room slows the entry rate down.

### How single points of failure are avoided

- **DNS and CDN:** both run on many servers around the world already.
- **Load balancer:** two, so if one fails the other takes over.
- **App servers:** several, in different data centres. They are stateless, so any of them can handle any request.
- **Cache:** a cluster with a replica. If the cache goes down, the app servers read from the database instead (slower, but it works, and the waiting room protects the database).
- **Primary database:** the read replica can be promoted if the primary fails, and there are regular backups. Writes pause for a short time during the switch.
- **Queue and workers:** the queue stores jobs on disk, and there are several workers. If a worker crashes, its job goes back in the queue.

## 8. Trade-offs

1. **Correctness against speed and scale.** All seat decisions go through one primary database with locks and transactions. This is slower and harder to scale than letting many servers each decide, but it is the only way I can be sure about no double-booking. I accept the lower speed and protect the database with the waiting room and cache instead. If I allowed "eventual consistency" for seats, I would sometimes sell the same seat twice, and refunding unhappy customers would cost far more.
2. **Waiting room: protection and fairness against a worse experience.** The waiting room keeps the system alive and gives a fair order, but it adds a new component to build, and some users have to wait or give up. The alternative is letting everyone in at once, which risks crashing the site for everybody, so I think the waiting room is worth it.
3. **Hold time: 10 minutes.** A longer hold gives people enough time to pay, but seats stay locked by people who never pay, so the event looks sold out when it is not. A shorter hold gets the seats back faster but stresses the buyers. I chose 10 minutes, and seats come back automatically when it ends.
4. **Cached seat map: speed against freshness.** A user may see a seat as free just after somebody else took it, and then get `409` when they try. This is a small annoyance and it protects the database, so I accept it.
5. **Charging the card before committing the sale.** This is simple and gives a quick answer, but it creates the "charged, then crashed" gap. I accept it because the idempotency key and the checking worker close the gap.

### Alternatives I considered

- **Optimistic locking** (a `version` number on each seat that must match when updating): it works too, but under heavy competition for the same seats many attempts would fail and need retries. The single conditional `UPDATE` is simpler.
- **One queue per event that handles holds one at a time:** it removes lock waiting completely, but it adds a bottleneck and a component to maintain. It could be a later improvement if one event becomes too hot.
- **A distributed lock in Redis:** it would add a second system that must agree with the database. Using the database's own locks keeps one source of truth.
- **NoSQL database:** rejected for the transaction reasons in section 5.

## 9. Risks and open questions

- **Hot rows:** everyone wants the best seats, so those rows may get a lot of lock waiting. I should load-test it. Letting people choose "best available seats" automatically might spread the load.
- **Bots:** they can still beat a CAPTCHA. I would need to watch for strange patterns and have a way to cancel suspicious orders.
- **The waiting room's admission rate (100 per second) is a guess.** It needs a load test to set properly.
- **Database failover** can lose the last few writes if the replica was a little behind. How much loss is acceptable is a business decision I still need answered.
- **Refunds and resale** are not designed yet (non-goals), and they will need a way to put a seat back on sale, which changes the `UNIQUE (seat_id)` rule on `tickets`.
