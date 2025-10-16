import {test as brittleTest, hook as brittleHook, solo as brittleSolo} from 'brittle';

const hook = (label, callback) => {
  brittleHook(label, async (t) => {
    try{
      await callback(t)
      t.end()
    } catch (error) {
      t.fail(`FAIL: ${label}`, error?.message || error);
    }
  })
}

const overwrite = t => {
  const exec = t.test // brittleTest wouldnt work due to syncronicity, had to do this.
  return Object.assign({}, t, { 
    test: (label, callback) => exec(label, async (t) => {
      try{
        await callback(t)
        t.end()
      } catch (error) {
        t.fail(`FAIL: ${label}`, error?.message || error);
      }
    })
  })
}

const solo = (label, callback) => {
  brittleSolo(label, async (t) => {
    try{
      await callback(t)
    } catch (error) {
      t.fail(`FAIL: ${label}`, error?.message || error);
    }
  })
}

const test = (label, callback) => {
  brittleTest(label, async (t) => {
    try{
      await callback(overwrite(t))
      t.end()
    } catch (error) {
      t.fail(`FAIL: ${label}`, error?.message || error);
    }
  })
}

export {
  test,
  hook,
  solo
}