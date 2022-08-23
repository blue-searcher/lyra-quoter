
async function main() {
  const [deployer] = await ethers.getSigners();
    
  console.log("Deployer:", deployer.address);

  const Factory = await ethers.getContractFactory("LyraQuoter", {
    libraries: {
      BlackScholes: "0xE97831964bF41C564EDF6629f818Ed36C85fD520",
    },
  });
  const contract = await Factory.connect(deployer).deploy(
    "0xF5A0442D4753cA1Ea36427ec071aa5E786dA5916", //register
  );

  console.log("Address:", contract.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
