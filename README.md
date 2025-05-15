# `create-preact`

<h2 align="center">
  <img height="256" width="256" src="./src/assets/preact.svg">
</h2>

<h3 align="center">Get started using Preact and Vite!</h3>

## Getting Started

-   `npm run dev` - Starts a dev server at http://localhost:5173/

-   `npm run build` - Builds for production, emitting to `dist/`. Prerenders all found routes in app to static HTML

-   `npm run preview` - Starts a server at http://localhost:4173/ to test production build locally


@TODO:
+ Grid completion scenario needs to be dealt with better.
+ We can maybe check if the grid was completed by reporting back from the batch toggle fn, and disable all clicks on it
+ We should also prevent clicks if the grid is completed
+ Any stray clicks should also be mitigated, i.e. while the grid was being marked as completed, if one of the cells
  got updated, this change should be reverted.
+ [Later] We can get users to pick a side, "Turn on the lights" vs. "Turn off the lights" and only register clicks for those