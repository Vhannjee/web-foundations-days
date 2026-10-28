# SnapShare Scaling Plan

SnapShare is a photo-sharing app. People upload photos and scroll a feed with photos from the people they follow. In this plan I work out how much traffic the app gets and how I would build it so it doesn't crash.

## 1. Assumptions

Facts from the task:

- 10 million registered users
- 10% of them are active each day
- Each active user uploads 1 photo a day
- Each active user views 50 feed pages a day
- A photo is 2 MB on average, and each photo also gets a 50 KB thumbnail

Things I assumed myself so the maths is easier:

- Traffic is spread evenly over the whole day (24 hours = 86,400 seconds) to get the average.
- Peak traffic is 5 times the average (the task said to use 5x).
- 1 TB = 1,000,000 MB, and a year has 365 days.
- Nobody deletes photos, so storage only goes up.
- For the bandwidth part only: one feed page shows about 10 thumbnails.

## 2. Estimates

**Daily active users**

10,000,000 x 10% = **1,000,000 daily active users**

**Uploads per second**

- Uploads per day = 1,000,000 users x 1 photo = 1,000,000 photos
- Average = 1,000,000 / 86,400 = about **12 uploads per second**
- Peak = 12 x 5 = about **58 uploads per second** (11.6 x 5 = 57.9)

**Feed views per second**

- Feed views per day = 1,000,000 users x 50 = 50,000,000 views
- Average = 50,000,000 / 86,400 = about **579 views per second**
- Peak = 579 x 5 = about **2,900 views per second**

**Storage per year**

- One photo = 2 MB + 0.05 MB thumbnail = 2.05 MB
- Per day = 1,000,000 x 2.05 MB = 2,050,000 MB = **2.05 TB per day**
- Per year = 2.05 TB x 365 = about **748 TB per year** (almost 0.75 PB)
- That is 730 TB of originals and 18.25 TB of thumbnails.

**Extra: thumbnail traffic**

I wanted to see how much data gets sent out. 579 views per second x 10 thumbnails = about 5,800 thumbnails per second. At 50 KB each that is about **290 MB per second** on average and about **1.45 GB per second** at peak. That is a lot for our own servers to send, so this is a big reason to use a CDN.

## 3. Read-heavy or write-heavy?

I think SnapShare is **read-heavy**. There are 50 feed views for every 1 upload, so reads are about 50 times more common than writes. It is probably even more than that, because every feed page loads lots of images and one photo can be seen by all the followers.

What this means for my design:

- I should make reading fast and cheap. That is why I use a cache, a read replica and a CDN, so most reads never touch the main database.
- Writes are fewer (about 58 a second at peak), so one main database can handle them.
- Slow jobs like making thumbnails should happen in the background, not while the user waits.
- It is okay if a new photo takes a few seconds to show up for everyone, so I can use caching.

## 4. Why photos should not go in the database

- **Too big.** Photos add about 748 TB a year, but the text records (who uploaded it, when, etc.) only add about 0.4 TB. The database would get way too big.
- **Slow and expensive.** Database storage costs more than file storage, and backing up huge files takes a very long time.
- **It clogs the database.** Big files would use up the memory that the database needs for its normal small records.
- **Wrong tool.** A database is for searching and connecting data, not for sending image files to users.

So the photos go in **object storage** (like Amazon S3). It is cheap, can hold almost any amount of files and keeps backup copies. The database only saves the **file name/key** of each photo (a short piece of text), and the app uses that to find the file.

## 5. Architecture diagram

```
              Users (phones and browsers)
               |                       ^
  API requests |                       | photos and thumbnails
               |                       |
               v                       |
      +-----------------+        +-----------+
      |  Load Balancer  |        |    CDN    |
      +--------+--------+        +-----+-----+
               |                       | (only if the CDN
               v                       |  does not have the file)
      +-----------------+              |
      |   App Servers   |              |
      |  (many copies)  |              v
      +--+-----+-----+--+    +--------------------------+
         |     |     |       |      Object Storage      |
         |     |     +-(1)-->| originals and thumbnails |
         |     | (3) add job +--------------------------+
         |     v                           ^ (5) save thumbnail
         | +-------+             +------------------+
         | | Queue |---(4)------>| Thumbnail Worker |
         | +-------+             +------------------+
         |
         | (2) save records, read feeds
         +-------------------+-----------------------------+
         |                   |                             |
         v                   v                             v
    +---------+       +--------------+              +--------------+
    |  Cache  |       |  Primary DB  |-- copies --->| Read Replica |
    | (Redis) |       | (all writes) |              | (feed reads) |
    +---------+       +--------------+              +--------------+
```

How to read it:

- The numbers (1) to (5) are the steps when someone uploads a photo (see section 7).
- When someone opens their feed, the app server asks the cache first. If the cache doesn't have it, it asks the read replica.
- The browser gets the image files from the CDN. The CDN only goes to object storage if it doesn't have the file yet.

## 6. What each part does

- **CDN:** It keeps copies of photos near the users, so images load faster and our servers don't have to send every picture.
- **Load balancer:** It shares the incoming requests between lots of app servers, so one server doesn't get overloaded and a broken server can be skipped.
- **App servers:** They run the app code (login, uploads, building the feed), and because they don't store any data themselves I can just add more of them when traffic grows.
- **Cache:** It keeps popular data like feeds in fast memory, so the database gets asked much less often.
- **Primary database:** It is the one main place where users, follows and photo records are saved, and it is the only place that gets written to.
- **Read replica:** It is a copy of the database that handles the feed reads, which takes load off the primary and also works as a backup.
- **Object storage:** It stores all the photo files cheaply and safely, so the database doesn't have to.
- **Queue:** It lets the app server write down "make a thumbnail for this photo" and answer the user straight away, instead of waiting for the work to finish.
- **Thumbnail worker:** It does the slow thumbnail work in the background, and I can add more workers if the queue gets long.

## 7. Upload flow, step by step

1. The user picks a photo and taps Upload. The app sends it to SnapShare.
2. The **load balancer** passes the request to one of the **app servers**.
3. The app server checks that the user is logged in and that the file is really an image and not too big.
4. **(1)** The app server saves the original 2 MB photo in **object storage** and gets back the file key.
5. **(2)** The app server saves a record in the **primary database**: photo id, user id, file key, caption, time, and the status `processing`.
6. **(3)** The app server puts a job in the **queue**: "make a thumbnail for photo 123".
7. The app server replies to the user right away with `201 Created`. The upload feels quick because the thumbnail isn't made yet, so the app shows a placeholder for now.
8. **(4)** A **thumbnail worker** takes the job from the queue and gets the original from object storage.
9. **(5)** The worker makes the 50 KB thumbnail, saves it in object storage and changes the photo's status in the database to `ready`.
10. If the worker fails, the job goes back in the queue and tries again. If it keeps failing, it goes in a "failed jobs" list so someone can check it.
11. The cache entries for the followers' feeds are refreshed, so the photo shows up the next time they open their feed. The image files themselves come through the **CDN**.

## 8. Trade-offs

1. **Cache: faster, but data can be old.** The cache makes feeds really fast and protects the database. The problem is that cached data can be out of date, for example someone deletes a photo but other people still see it in their feed for a bit. Deciding when to clear the cache is tricky. I would accept a slightly old feed for the speed and use short expiry times.
2. **Read replica: handles more reads, but there is a delay.** A new write takes a moment to copy from the primary to the replica. So a user might upload a photo and not see it in their feed straight away. I could fix this by reading the user's own recent photos from the primary. It also costs more because I need extra database servers.
3. **Queue and worker: fast upload, but thumbnails arrive late.** The user gets a quick reply, but the thumbnail takes a few seconds, so I need a placeholder and a status column. It also makes the system more complicated because there is more to run and watch (queue, workers, retries).
4. **CDN: faster and cheaper to run, but it costs money and is harder to control.** If a photo is deleted, the CDN might keep showing it until its copy expires. Private photos would need special links that expire.
5. **Files and records in two places.** The photo file is in object storage and its record is in the database, so they could get out of sync (a file with no record, or a record with no file). I would save the file first, then the record, and clean up leftover files now and then.
