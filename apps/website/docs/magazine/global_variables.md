# Global variables and frontend

What problems do we have with the following code?

```js
axios.interceptors.request.use(
  function (config) {
    config.headers['X-Custom-Token': getTokenSomehow()];

    return config;
  }
);
```

So, it's quite a lot, but let's focus on the global variable `axios` and it's operations.

::: tip TL;DR
It causes possible mixing between different users during SSR, make tests slower and stories harder to write.
:::

## Environments

In the modern world our frontend applications can run in different environments:

- browser as a standalone application
- browser as a part of a bigger application (e.g. in [Storybook](https://storybook.js.org/))
- Node.js as a test-case
- Node.js as a server-side rendering application

Let's take a closer look and find out how global variables can affect our application in each of them.

### ✅ Standalone application

In this case, we have only one instance of our application in a single process. It means that we can use global variables to store our application state. **It's safe.**

### 🟨 Embedded application (e.g. in [Storybook](https://storybook.js.org/))

> This case is valid only for development mode, so it won't affect production.

Typically, we have a lot of stories inside single tab of a browser while using tools like [Storybook](https://storybook.js.org/). It means that we can have more than one instance of our application in a single process. So, it can be a bit dangerous to use global variables to store our application state, because different stories can interfere with each other.

However, some tools from this category can provide its own way to isolate different stories from each other. So, **it could be safe** to use global variables in this case.

### 🟨 Test-case

> This case is valid only for development mode, so it won't affect production.

Tests are running in a Node.js which is single-threaded by default. It means that we can have more than one instance of our application in a single process. So, we have to be careful with global variables to store our application state, because otherwise different tests can interfere with each other.

To simplify it, some of test-runners can provide its own way to isolate different tests from each other, but due to limit access to code internal implementation their solution can significantly decrease performance of tests. So, **it could be safe** to use global variables in this case.

### 🔴 Server-side rendering

Server side rendering is process of rendering application on a server and sending it to a browser. Because of single-threaded nature of Node.js, we can have more than one instance of our application in a single process during render. So, if we use global variables to store our application state and change it for one user, it can affect another user. In general, **it is not safe** to use global variables in case of SSR.

### Summary

As you can see, in 3/4 of environments we have more than one instance of our application in a single process. It means that we can't use global variables to store our application state. It's not safe. Let's see how we can solve this problem.

:::tip Q: I don't use SSR, so I can use global variables, right?
**A**: Yes, but. If avoiding global variables costs you almost nothing, why not to do it? It will make your application more predictable and easier to test. If you need to use SSR in the future, you will have to refactor your code anyway.
:::

## The problem

Because of usage of global instance of `axios` and applying some global state (with `getTokenSomehow` function) requests can be sent with wrong token in SSR or tests.

## Theoretical solution

The key of this problem is global state. Let's see how to avoid global state in different frameworks.

### React-way

React-way is to use [React Context](https://reactjs.org/docs/context.html) to store our application state.

::: tip
React used as an example, but almost all frontend frameworks have similar concepts.
:::

We can use a value from a context 👇

```tsx{3}
// app.tsx
function App() {
  const userId = useContext(UserIdContext);

  return (
    <main>
      <h1>Hello, world!</h1>
      <p>{currentValue}</p>
    </main>
  );
}
```

And pass it in particular environment independently through a context provider 👇

::: code-group

```tsx [client.entrypoint.tsx]
import { createRoot } from "react-dom/client";

// In client-side environment we can read a value from a browser
createRoot(document.getElementById("root")).render(
  <UserIdContext.Provider value={readUserIdFromBrowser()}>
    <App />
  </UserIdContext.Provider>
);
```

```tsx [server.tsx]
import { renderToString } from "react-dom/server";

function handleRequest(req, res) {
  // In server-side environment we can read a value from a request
  const html = renderToString(
    <UserIdContext.Provider value={readUserIdFromRequest(req)}>
      <App />
    </UserIdContext.Provider>
  );

  res.send(html);
}
```

```tsx [app.test.tsx]
import { render } from "@testing-library/react";

describe("App", () => {
  it("should render userId", () => {
    // In test environment we can use a mock value
    const { getByText } = render(
      <UserIdContext.Provider value={"42"}>
        <App />
      </UserIdContext.Provider>
    );

    expect(getByText("42")).toBeInTheDocument();
  });
});
```

```tsx [app.stories.tsx]
export default {
  component: App,
  title: "Any random title",
};

export const Default = () => {
  // In Storybook environment we can use a mock value as well
  return (
    <UserIdContext.Provider value={"mockUserId"}>
      <App />
    </UserIdContext.Provider>
  );
};
```

:::

Now, it is bulletproof. We can render any amount of instances of our application in a single process, and they will not interfere with each other. It's a good solution, but it's not suitable for non-React contexts (like business logic layer). Let's see how we can solve this problem with Effector.

### Effector-way

::: tip
To correct work with [_Scope_](https://effector.dev/docs/api/effector/store)-full runtime, your application have to follow [some rules](/magazine/fork_api_rules).
:::

Effector has its own API to isolate application state, it's called Fork API — [`fork`](https://effector.dev/docs/api/effector/fork) function returns a new [_Scope_](https://effector.dev/docs/api/effector/scope) which is a container for all application state. Let's see how we can use it in all mentioned environments.

Let's save a user id in a [_Store_](https://effector.dev/docs/api/effector/store) 👇

```ts
// app.ts
import { createStore } from "effector";

const $userId = createStore(null);
```

Later we can replace a value in a [_Store_](https://effector.dev/docs/api/effector/store) during `fork` call 👇

::: code-group

```ts [client.entrypoint.ts]
import { fork } from "effector";

// In client-side environment we can read a value from a browser
const scope = fork({ values: [[$userId, readUserIdFromBrowser()]] });
```

```tsx [server.tsx]
import { fork } from "effector";

function handleRequest(req, res) {
  // In server-side environment we can read a value from a request
  const scope = fork({ values: [[$userId, readUserIdFromRequest(req)]] });

  // ...
}
```

```tsx [app.test.tsx]
import { fork } from "effector";

describe("App", () => {
  it("should pass userId", () => {
    // In test environment we can use a mock value
    const scope = fork({ values: [[$userId, "42"]] });

    expect(scope.getState($userId)).toBe("42");
  });
});
```

:::

#### UI-libraries integration

To connect UI-library to Effector, you have to use a integration library. For example, for React, you can use [`effector-react`](https://effector.dev/docs/api/effector-react) library. It supports Fork API, let's see how we can use it 👇

```tsx{5}
// app.tsx
import { useUnit } from "effector-react";

function App() {
  const userId = useUnit($userId);

  return (
    <main>
      <h1>Hello, world!</h1>
      <p>{currentValue}</p>
    </main>
  );
}
```

And pass your [_Scope_](https://effector.dev/docs/api/effector/scope) to the integration library through a context provider 👇

::: code-group

```tsx{6,9-11} [client.entrypoint.tsx]
import { createRoot } from "react-dom/client";
import { fork } from "effector";
import { Provider } from "effector-react";

// In client-side environment we can read a value from a browser
const scope = fork({ values: [[$userId, readUserIdFromBrowser()]] });

createRoot(document.getElementById("root")).render(
  <Provider value={scope}>
    <App />
  </Provider>
);
```

```tsx{7,10-12} [server.tsx]
import { renderToString } from "react-dom/server";
import { fork } from "effector";
import { Provider } from "effector-react";

function handleRequest(req, res) {
  // In server-side environment we can read a value from a request
  const scope = fork({ values: [[$userId, readUserIdFromRequest(req)]] });

  const html = renderToString(
    <Provider value={scope}>
      <App />
    </Provider>
  );

  res.send(html);
}
```

```tsx{8,11-13} [app.test.tsx]
import { render } from "@testing-library/react";
import { fork } from "effector";
import { Provider } from "effector-react";

describe("App", () => {
  it("should render userId", () => {
    // In test environment we can use a mock value
    const scope = fork({ values: [[$userId, "42"]] });

    const { getByText } = render(
      <Provider value={scope}>
        <App />
      </Provider>
    );

    expect(getByText("42")).toBeInTheDocument();
  });
});
```

```tsx{10,15-18} [app.stories.tsx]
import { fork } from "effector";
import { Provider } from "effector-react";

export default {
  component: App,
  title: "Any random title",
};

// In Storybook environment we can use a mock value as well
const scope = fork({ values: [[$userId, "mockUserId"]] });

export const Default = () => {
  return (
    <Provider value={scope}>
      <App />
    </Provider>
  );
};
```

:::

:::tip
React is used as an example, but you can use any UI-library which has an integration with Effector.
:::

## The solution

So, let's return to original problem with a global interceptor on global `axios` instance. We can save an instance to the [_Store_](https://effector.dev/docs/api/effector/store) and apply an interceptor to it exclusively 👇

```ts
// app.ts
import { createStore, createEvent, sample, attach } from "effector";
import { createInstance } from "axios";

// Will be filled later, during fork
const $userToken = createStore(null);

const $axios = createStore(null);

// An event that will be fired when application is started
const applicationStared = createEvent();

const setupAxiosFx = attach({
  source: { userToken: $userToken },
  effect({ userToken }) {
    const instance = createInstance();

    instance.interceptors.request.use((config) => {
      config.headers["X-Custom-Token"] = userToken;
      return config;
    });

    return instance;
  },
});

sample({ clock: applicationStared, target: setupAxiosFx });
sample({ clock: setupAxiosFx.doneData, target: $axios });
```

:::tip
In this example, we use [implicit start _Event_ of the application](/magazine/implicit_start). It is a good practice to use it, because it allows you to control the start of the application.
:::

After that, we can [`fork`](https://effector.dev/docs/api/effector/fork) the application and pass a new value of our [_Stores_](https://effector.dev/docs/api/effector/store) for every particular environment 👇

::: code-group

```ts [client.entrypoint.ts]
import { fork, allSettled } from "effector";

const scope = fork({
  values: [[$userToken, readUserTokenFromBrowserCookie()]],
});

await allSettled(applicationStared, { scope });
```

```tsx [server.tsx]
import { fork, allSettled } from "effector";

async function handleRequest(req, res) {
  const scope = fork({
    values: [[$userToken, readUserTokenFromRequestCookies(req)]],
  });

  await allSettled(applicationStared, { scope });
}
```

```tsx [app.test.tsx]
import { fork, allSettled } from "effector";

describe("App", () => {
  it("should start an app", async () => {
    // Do not pass any values to the fork, because we don't need them in tests
    // $userToken will be filled with null
    const scope = fork();

    await allSettled(applicationStared, { scope });
  });
});
```

:::

That's it! Now we can use the same code for all environments and don't worry about global state, because it's isolated in the [_Scope_](https://effector.dev/docs/api/effector/scope).

:::tip
Read more about `allSettled` function in the article about [implicit start _Event_ of the application](/magazine/implicit_start).
:::

## Recap

- Global state is a bad idea, because it can lead to unpredictable behavior in tests, SSR and other environments.
- Effector has its own API to isolate application state, it's called Fork API — [`fork`](https://effector.dev/docs/api/effector/fork) function returns a new [_Scope_](https://effector.dev/docs/api/effector/scope) which is a container for all application state.
- Application that uses Fork API must follow [some rules](/magazine/fork_api_rules).
- To use Fork API with a UI-library, you have to use an integration library. For example, for React, you can use [`effector-react`](https://effector.dev/docs/api/effector-react) library.