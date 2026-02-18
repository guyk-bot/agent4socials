# TikTok App Review (max 1000 characters)

Copy the text below into the "Explain how each product and scope works within your app or website" field.

---

Agent4socials (https://agent4socials.com) is a web app where users manage and publish content to multiple social networks, including TikTok. Login Kit: users connect their TikTok account via OAuth; we redirect to TikTok then back to our callback to obtain and store an access token. Content Posting API: we publish videos to TikTok when users create a post in our Composer and choose TikTok as a target (post now or scheduled). Share Kit: we offer a one-tap Share to TikTok from our app. user.info.basic: we use open_id to identify the connected user and associate the token with their account. user.info.profile: we show display name, profile link, and bio in the dashboard. user.info.stats: we show follower count, likes count, and video count in the dashboard. video.list: we list the user's TikTok videos in our app. video.upload: we upload and publish the user's video to TikTok when they post from our Composer. All data is shown only to the account owner within our app.
