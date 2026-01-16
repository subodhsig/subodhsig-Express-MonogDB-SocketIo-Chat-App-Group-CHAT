Getting Started

Follow these steps to run the app locally:

1. Install Dependencies

Install all required packages using pnpm:

pnpm install

2. Set Up Environment Variables

Create a .env file in the root directory of the project with the following content:

{
PORT=3003
MONGODB_URI="your url here"
JWT_SECRET=jhsdbfijlsdhoifhsilufhsdilfhiuwegh
CLIENT_URL=http://localhost:3003
}


Note: Replace values with your own credentials if needed. Keep the .env file private and do not commit it to GitHub.

3. Start the Development Server

Run the server in development mode:

pnpm run dev

4. Open the Frontend

Open index.html in the project root.

Use Live Server (VS Code extension) for live reloading.

 Your app should now be running locally at http://localhost:3003.
server url for socket is :http://localhost:3003 
api url : http://localhost:3003/api 

