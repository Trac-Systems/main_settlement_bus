# Main Settlement Bus (MSB)

A peer-to-peer crypto validator network to verify and append transactions.

Release 1 (R1) must be used alongside Trac Network R1 releases to maintain contract consistency.

The MSB is utilizing the [Pear Runtime and Holepunch](https://pears.com/).

## Install

```shell
git clone -b msb-r1 --single-branch git@github.com:Trac-Systems/main_settlement_bus.git
```

## Usage

While the MSB supports native node-js, it is encouraged to use Pear:

```js
cd main_settlement_bus
npm install -g pear
npm install
pear run . store1
```

**Deploy Bootstrap (admin):**

- Choose option 1)
- Copy and backup the seedphrase
- Copy the "MSB Writer" address
- With a text editor, open the file msb.mjs in document root
- Replace the bootstrap address with the copied writer address
- Choose a channel name (exactly 32 characters)
- Run again: pear run . store1
- After the options appear, type /add_admin and hit enter
- Your instance is now the Bootstrap and admin peer, required to control validators
- Keep your bootstrap node running
- Strongly recommended: add a couple of nodes as writers

**Running indexers (admin)**

- Install on different machines than the Bootstrap's (ideally different data centers)
- Follow the "Running as validator" and then "Adding validators" procedures below
- Copy the MSB Writer address from your writer screen
- In your Bootstrap screen, add activate the new writers:
- /add_indexer <MSB Writer address (not the MSB address!)>
- You should see a success confirmation
- Usually 2 indexers on different locations are enough, we recommend 2 to max. 4 in addition to the Bootstrap

**Running as validator (first run):**

- Choose option 1)
- Copy and backup the seedphrase
- Copy the "MSB Address" after the screen fully loaded
- Hand your "MSB Address" over to the MSB admin for whitelisting
- Wait for the admin to announce the whitelist event
- In the screen type /add_writer
- After a few seconds you should see your validator being added as a writer

**Adding validators (admin):**

- Open the file /Whitelist/pubkeys.csv with a text editor
- Add as man Trac Network addresses as you wish
- In the MSB screen, enter /add_whitelist
- Wait for the listto  be fully processed
- Inform your validator community being whitelisted