import { store } from "./app/store";

function App() {

    console.log(store.getState()); // Log the initial state of the store
    return <h1>OmniStore SaaS</h1>;
  }
  
  export default App;