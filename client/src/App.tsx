import { store } from "./app/store";
function App() {
  console.log(store.getState());
  return <h1>OmniStore SaaS</h1>;
}
export default App;
